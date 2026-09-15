import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../_lib/requireAdmin.js";
import { internalError } from "../_lib/errorResponse.js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MAX_MESSAGE_LENGTH = 4096;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const N8N_CALL_TIMEOUT_MS = 10_000;
const DEFAULT_TEMPLATE = "Olá {{name}}! Não se esqueça de preencher seu diário de hoje: {{link}}";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const callerId = await requireUser(req, res, supabaseAdmin);
  if (!callerId) return;

  const webhookUrl = process.env.N8N_SEND_WEBHOOK_URL;
  const secret = process.env.N8N_SEND_WEBHOOK_SECRET;
  const appUrl = process.env.PUBLIC_APP_URL;
  if (!webhookUrl || !secret) {
    return res.status(500).json({ error: "Integração de envio não configurada" });
  }

  const body = (req.body ?? {}) as { patientId?: unknown; message?: unknown; useTemplate?: unknown };
  const patientId = typeof body.patientId === "string" ? body.patientId : "";
  const useTemplate = body.useTemplate === true;
  const rawMessage = typeof body.message === "string" ? body.message.trim() : "";

  if (!patientId) {
    return res.status(400).json({ error: "patientId é obrigatório" });
  }
  if (!useTemplate && !rawMessage) {
    return res.status(400).json({ error: "message é obrigatório" });
  }
  if (rawMessage.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Mensagem muito longa (máximo ${MAX_MESSAGE_LENGTH} caracteres)` });
  }

  const { data: patient, error: patientError } = await supabaseAdmin
    .from("patients")
    .select("id, name, phone, public_token, archived_at")
    .eq("id", patientId)
    .maybeSingle();
  if (patientError) return internalError(res, "messages/send-manual:patient", patientError);
  if (!patient) return res.status(404).json({ error: "not_found" });
  if (patient.archived_at) return res.status(409).json({ error: "patient_archived" });
  if (typeof patient.phone !== "string" || !patient.phone.trim()) {
    return res.status(409).json({ error: "no_phone" });
  }

  let message = rawMessage;
  let link = "";

  if (useTemplate) {
    // Template (Meta-approved) funciona independente da janela de 24h — é
    // exatamente pra isso que serve, então não checamos last-inbound aqui.
    if (!appUrl || !patient.public_token) {
      return res.status(500).json({ error: "Link do formulário não pôde ser gerado" });
    }
    link = `${appUrl.replace(/\/$/, "")}/formulario/${patient.public_token}`;

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .select("reminder_message_template")
      .eq("id", true)
      .maybeSingle();
    if (settingsError) return internalError(res, "messages/send-manual:settings", settingsError);

    const template = settings?.reminder_message_template || DEFAULT_TEMPLATE;
    const firstName = String(patient.name).trim().split(/\s+/)[0] ?? patient.name;
    message = template.replace(/\{\{\s*name\s*\}\}/g, firstName).replace(/\{\{\s*link\s*\}\}/g, link);
  } else {
    // Mensagem manual em texto livre — só funciona dentro da janela de 24h
    // (regra do WhatsApp). Sem template de fallback aqui: bloqueia com erro
    // claro em vez de deixar o WhatsApp rejeitar silenciosamente depois.
    const { data: lastInbound, error: inboundError } = await supabaseAdmin
      .from("messages")
      .select("created_at")
      .eq("patient_id", patientId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inboundError) return internalError(res, "messages/send-manual:inbound-lookup", inboundError);

    const withinWindow = lastInbound
      ? Date.now() - new Date(lastInbound.created_at).getTime() < WINDOW_MS
      : false;
    if (!withinWindow) {
      return res.status(409).json({ error: "outside_24h_window" });
    }
  }

  let n8nOk = false;
  try {
    const n8nRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret },
      body: JSON.stringify({
        patients: [
          {
            patientId: patient.id,
            name: patient.name,
            phone: patient.phone,
            link,
            message,
            channel: useTemplate ? "template" : "text",
          },
        ],
      }),
      signal: AbortSignal.timeout(N8N_CALL_TIMEOUT_MS),
    });
    n8nOk = n8nRes.ok;
    if (!n8nRes.ok) {
      const text = await n8nRes.text().catch(() => "");
      console.error("[messages/send-manual] n8n respondeu com erro", n8nRes.status, text);
    }
  } catch (e) {
    console.error("[messages/send-manual] falha ao chamar o n8n", e);
  }

  if (!n8nOk) {
    return res.status(502).json({ error: "Falha ao acionar o envio (n8n indisponível)" });
  }

  return res.status(200).json({ ok: true });
}