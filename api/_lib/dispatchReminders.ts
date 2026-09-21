import { createClient } from "@supabase/supabase-js";
import { buildTemplatePayload, renderTextTemplate, type WhatsappTemplateRow } from "./whatsappTemplate.js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MAX_PATIENTS_PER_REQUEST = 200;
const N8N_CALL_TIMEOUT_MS = 10_000;
const DEFAULT_TEMPLATE_TEXT = "Olá {{name}}! Não se esqueça de preencher seu diário de hoje: {{link}}";
const WINDOW_MS = 24 * 60 * 60 * 1000;

export type SkipReason = "not_found" | "archived" | "no_phone" | "no_token" | "no_template";

export interface DispatchResult {
  sent: number;
  skipped: Array<{ patientId: string; reason: SkipReason }>;
}

/**
 * Monta e dispara os lembretes pros patientIds informados — decide texto
 * livre vs template por paciente (janela de 24h), monta o payload de
 * template a partir do que estiver cadastrado em `whatsapp_templates`, e
 * aciona o webhook do n8n. Usado tanto por api/messages/send-form.ts (staff
 * clicando "Enviar mensagem") quanto por api/cron/no-response.ts (robô
 * diário, paciente sem responder há 2+ dias).
 */
export async function dispatchReminders(patientIdsInput: string[]): Promise<DispatchResult> {
  const webhookUrl = process.env.N8N_SEND_WEBHOOK_URL;
  const secret = process.env.N8N_SEND_WEBHOOK_SECRET;
  const appUrl = process.env.PUBLIC_APP_URL;
  if (!webhookUrl || !secret || !appUrl) {
    throw new Error("Integração de envio não configurada (N8N_SEND_WEBHOOK_URL/SECRET/PUBLIC_APP_URL)");
  }

  const patientIds = patientIdsInput.slice(0, MAX_PATIENTS_PER_REQUEST);
  const skipped: DispatchResult["skipped"] = [];

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("app_settings")
    .select("reminder_message_template, reminder_template_id")
    .eq("id", true)
    .maybeSingle();
  if (settingsError) throw settingsError;

  const bodyTemplateText = settings?.reminder_message_template || DEFAULT_TEMPLATE_TEXT;

  let reminderTemplate: WhatsappTemplateRow | null = null;
  if (settings?.reminder_template_id) {
    const { data: templateRow, error: templateError } = await supabaseAdmin
      .from("whatsapp_templates")
      .select("id, name, language, parameters")
      .eq("id", settings.reminder_template_id)
      .maybeSingle();
    if (templateError) throw templateError;
    reminderTemplate = (templateRow as WhatsappTemplateRow) ?? null;
  }

  const { data: patients, error: fetchError } = await supabaseAdmin
    .from("patients")
    .select("id, name, phone, public_token, archived_at")
    .in("id", patientIds);
  if (fetchError) throw fetchError;

  const found = new Map((patients ?? []).map((p: any) => [p.id as string, p]));

  const ready: Array<{ patientId: string; name: string; phone: string; link: string }> = [];

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
    ready.push({
      patientId: p.id,
      name: p.name,
      phone: p.phone,
      link: `${appUrl.replace(/\/$/, "")}/formulario/${p.public_token}`,
    });
  }

  if (ready.length === 0) {
    return { sent: 0, skipped };
  }

  const readyIds = ready.map((r) => r.patientId);
  const { data: lastInboundRows, error: inboundError } = await supabaseAdmin
    .from("messages")
    .select("patient_id, created_at")
    .in("patient_id", readyIds)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false });
  if (inboundError) throw inboundError;

  const lastInboundByPatient = new Map<string, string>();
  for (const row of lastInboundRows ?? []) {
    if (!lastInboundByPatient.has(row.patient_id)) {
      lastInboundByPatient.set(row.patient_id, row.created_at);
    }
  }

  const now = Date.now();
  const withChannel = ready.map((r) => {
    const last = lastInboundByPatient.get(r.patientId);
    const withinWindow = last ? now - new Date(last).getTime() < WINDOW_MS : false;
    const channel = withinWindow ? "text" : "template";
    const message = renderTextTemplate(bodyTemplateText, { patientName: r.name, link: r.link });
    const templatePayload =
      channel === "template" && reminderTemplate
        ? buildTemplatePayload(reminderTemplate, { patientName: r.name, link: r.link })
        : undefined;
    return { ...r, channel, message, templatePayload };
  });

  const finalReady = withChannel.filter((r) => {
    if (r.channel === "template" && !r.templatePayload) {
      skipped.push({ patientId: r.patientId, reason: "no_template" });
      return false;
    }
    return true;
  });

  if (finalReady.length === 0) {
    return { sent: 0, skipped };
  }

  const n8nRes = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret },
    body: JSON.stringify({ patients: finalReady }),
    signal: AbortSignal.timeout(N8N_CALL_TIMEOUT_MS),
  });

  if (!n8nRes.ok) {
    const text = await n8nRes.text().catch(() => "");
    console.error("[dispatchReminders] n8n respondeu com erro", n8nRes.status, text);
    throw new Error("Falha ao acionar o envio (n8n indisponível)");
  }

  return { sent: finalReady.length, skipped };
}