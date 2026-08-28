import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../_lib/requireAdmin.js";
import { internalError } from "../_lib/errorResponse.js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MAX_PATIENTS_PER_REQUEST = 200;
const N8N_CALL_TIMEOUT_MS = 10_000;

type SkipReason = "not_found" | "archived" | "no_phone" | "no_token";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Qualquer staff autenticado pode disparar — a mesma permissão que já tem
  // pra ver/editar a lista de pacientes hoje. Não exige admin.
  const callerId = await requireUser(req, res, supabaseAdmin);
  if (!callerId) return;

  const webhookUrl = process.env.N8N_SEND_WEBHOOK_URL;
  const secret = process.env.N8N_SEND_WEBHOOK_SECRET;
  const appUrl = process.env.PUBLIC_APP_URL;
  if (!webhookUrl || !secret || !appUrl) {
    return res.status(500).json({ error: "Integração de envio não configurada" });
  }

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("app_settings")
    .select("reminder_message_template")
    .eq("id", true)
    .maybeSingle();
  if (settingsError) return internalError(res, "messages/send-form:settings", settingsError);
  const template =
    settings?.reminder_message_template ||
    "Olá {{name}}! Não se esqueça de preencher seu diário de hoje: {{link}}";

  const body = (req.body ?? {}) as { patientIds?: unknown };
  const patientIds = Array.isArray(body.patientIds)
    ? body.patientIds.filter((id): id is string => typeof id === "string")
    : [];

  if (patientIds.length === 0) {
    return res.status(400).json({ error: "patientIds é obrigatório e não pode ser vazio" });
  }
  if (patientIds.length > MAX_PATIENTS_PER_REQUEST) {
    return res.status(400).json({ error: `Máximo de ${MAX_PATIENTS_PER_REQUEST} pacientes por disparo` });
  }

  const { data: patients, error: fetchError } = await supabaseAdmin
    .from("patients")
    .select("id, name, phone, public_token, archived_at")
    .in("id", patientIds);

  if (fetchError) return internalError(res, "messages/send-form:fetch", fetchError);

  const found = new Map((patients ?? []).map((p: any) => [p.id as string, p]));

  const ready: Array<{ patientId: string; name: string; phone: string; link: string; message: string }> = [];
  const skipped: Array<{ patientId: string; reason: SkipReason }> = [];

  for (const id of patientIds) {
    const p = found.get(id);
    if (!p) {
      skipped.push({ patientId: id, reason: "not_found" });
      continue;
    }
    if (p.archived_at) {
      skipped.push({ patientId: id, reason: "archived" });
      continue;
    }
    if (typeof p.phone !== "string" || !p.phone.trim()) {
      skipped.push({ patientId: id, reason: "no_phone" });
      continue;
    }
    if (typeof p.public_token !== "string" || !p.public_token) {
      skipped.push({ patientId: id, reason: "no_token" });
      continue;
    }
    const firstName = String(p.name).trim().split(/\s+/)[0] ?? p.name;
    const link = `${appUrl.replace(/\/$/, "")}/formulario/${p.public_token}`;
    const message = template.replace(/\{\{\s*name\s*\}\}/g, firstName).replace(/\{\{\s*link\s*\}\}/g, link);
    ready.push({ patientId: p.id, name: p.name, phone: p.phone, link, message });
  }

  if (ready.length === 0) {
    return res.status(200).json({ sent: 0, skipped });
  }

  // Decide, por paciente, se dá pra mandar texto livre (janela de 24h aberta
  // desde a última mensagem RECEBIDA dele) ou se precisa de template aprovado
  // pela Meta (fora da janela, ou nunca conversou antes). Calculado aqui, com
  // dados que já temos em `messages` — não dá pra confiar na resposta síncrona
  // da API de envio de texto livre pra isso: ela retorna sucesso na hora mesmo
  // quando a mensagem será rejeitada depois, de forma assíncrona.
  const readyIds = ready.map((r) => r.patientId);
  const { data: lastInboundRows, error: inboundError } = await supabaseAdmin
    .from("messages")
    .select("patient_id, created_at")
    .in("patient_id", readyIds)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false });

  if (inboundError) return internalError(res, "messages/send-form:inbound-lookup", inboundError);

  const lastInboundByPatient = new Map<string, string>();
  for (const row of lastInboundRows ?? []) {
    // Já vem ordenado do mais recente pro mais antigo — só guarda a primeira
    // ocorrência de cada paciente (a mais recente).
    if (!lastInboundByPatient.has(row.patient_id)) {
      lastInboundByPatient.set(row.patient_id, row.created_at);
    }
  }

  const WINDOW_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const withChannel = ready.map((r) => {
    const last = lastInboundByPatient.get(r.patientId);
    const withinWindow = last ? now - new Date(last).getTime() < WINDOW_MS : false;
    return { ...r, channel: withinWindow ? "text" : "template" };
  });

  let n8nOk = false;
  try {
    const n8nRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret },
      body: JSON.stringify({ patients: withChannel }),
      signal: AbortSignal.timeout(N8N_CALL_TIMEOUT_MS),
    });
    n8nOk = n8nRes.ok;
    if (!n8nRes.ok) {
      const text = await n8nRes.text().catch(() => "");
      console.error("[messages/send-form] n8n respondeu com erro", n8nRes.status, text);
    }
  } catch (e) {
    console.error("[messages/send-form] falha ao chamar o n8n", e);
  }

  if (!n8nOk) {
    return res.status(502).json({ error: "Falha ao acionar o envio (n8n indisponível)", skipped });
  }

  // O registro no histórico (tabela `messages`, direction: "outbound") é feito
  // pelo próprio n8n, chamando api/messages/inbound.ts depois de enviar de
  // verdade via Chakra HQ — este endpoint só aciona o disparo, não grava nada.
  return res.status(200).json({ sent: ready.length, skipped });
}