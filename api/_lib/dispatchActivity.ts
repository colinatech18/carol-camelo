import {
  buildTemplatePayload,
  renderTextTemplate,
  type WhatsappTemplateRow,
} from "./whatsappTemplate.js";
import { supabaseAdmin } from "./supabaseAdmin.js";

const N8N_CALL_TIMEOUT_MS = 10_000;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ACTIVITY_MESSAGE = "Olá {{name}}! Você tem uma nova atividade disponível: {{link}}";

export type ActivitySkipReason = "archived" | "no_phone" | "no_token" | "no_template";

export interface ActivityDispatchResult {
  /** Ver o mesmo aviso em DispatchResult (dispatchReminders.ts): aceito pelo
   * n8n, não confirmação de entrega. */
  sent: number;
  /** Paciente + canal usado, pra api/activities/dispatch.ts e
   * api/cron/activities.ts gravarem o registro em `activity_dispatch_log`. */
  sentPatients: Array<{ patientId: string; channel: "text" | "template" }>;
  skipped: Array<{ patientId: string; reason: ActivitySkipReason }>;
}

export class ActivityDispatchError extends Error {
  code: "config" | "upstream";
  constructor(message: string, code: "config" | "upstream") {
    super(message);
    this.name = "ActivityDispatchError";
    this.code = code;
  }
}

type PatientRow = {
  id: string;
  name: string;
  phone: string | null;
  public_token: string | null;
  archived_at: string | null;
};

/**
 * Dispara uma atividade (link `/atividades/<token>`) para os pacientes dados.
 * Reaproveita a mesma lógica de canal de `dispatchReminders.ts` (texto livre
 * dentro da janela de 24h, template aprovado da Meta fora dela) — mas o
 * template é o PRÓPRIO da atividade (`whatsappTemplateId`, escolhido no editor
 * entre os templates cadastrados em Configurações → Integrações), não o do
 * lembrete do diário: o texto de um template aprovado é fixo, então reusar o
 * template do diário mandaria uma mensagem falando do diário numa atividade
 * diferente. Sem template configurado, quem está fora da janela de 24h é
 * pulado com `no_template` em vez de receber a mensagem errada. Chamado tanto
 * pelo disparo manual (api/activities/dispatch.ts) quanto pelo cron
 * (api/cron/activities.ts).
 */
export async function dispatchActivityToPatients(
  patients: PatientRow[],
  messageTemplateText: string,
  whatsappTemplateId: string | null,
  options: { timeoutMs?: number } = {},
): Promise<ActivityDispatchResult> {
  const webhookUrl = process.env.N8N_SEND_WEBHOOK_URL;
  const secret = process.env.N8N_SEND_WEBHOOK_SECRET;
  const appUrl = process.env.PUBLIC_APP_URL;
  if (!webhookUrl || !secret || !appUrl) {
    throw new ActivityDispatchError(
      "Integração de envio não configurada (N8N_SEND_WEBHOOK_URL/SECRET/PUBLIC_APP_URL)",
      "config",
    );
  }

  const skipped: ActivityDispatchResult["skipped"] = [];
  const ready: Array<{ patientId: string; name: string; phone: string; link: string }> = [];

  for (const p of patients) {
    if (p.archived_at) {
      skipped.push({ patientId: p.id, reason: "archived" });
      continue;
    }
    if (typeof p.phone !== "string" || !p.phone.trim()) {
      skipped.push({ patientId: p.id, reason: "no_phone" });
      continue;
    }
    if (typeof p.public_token !== "string" || !p.public_token) {
      skipped.push({ patientId: p.id, reason: "no_token" });
      continue;
    }
    ready.push({
      patientId: p.id,
      name: p.name,
      phone: p.phone,
      link: `${appUrl.replace(/\/$/, "")}/atividades/${p.public_token}`,
    });
  }

  if (ready.length === 0) return { sent: 0, sentPatients: [], skipped };

  let template: WhatsappTemplateRow | null = null;
  if (whatsappTemplateId) {
    const { data: templateRow, error: templateError } = await supabaseAdmin
      .from("whatsapp_templates")
      .select("id, name, language, parameters")
      .eq("id", whatsappTemplateId)
      .maybeSingle();
    if (templateError) throw templateError;
    template = (templateRow as WhatsappTemplateRow) ?? null;
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
    if (!lastInboundByPatient.has(row.patient_id))
      lastInboundByPatient.set(row.patient_id, row.created_at);
  }

  const bodyTemplateText = messageTemplateText || DEFAULT_ACTIVITY_MESSAGE;
  const now = Date.now();
  const withChannel = ready.map((r) => {
    const last = lastInboundByPatient.get(r.patientId);
    const withinWindow = last ? now - new Date(last).getTime() < WINDOW_MS : false;
    const channel = withinWindow ? "text" : "template";
    const message = renderTextTemplate(bodyTemplateText, { patientName: r.name, link: r.link });
    const templatePayload =
      channel === "template" && template
        ? buildTemplatePayload(template, { patientName: r.name, link: r.link })
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

  if (finalReady.length === 0) return { sent: 0, sentPatients: [], skipped };

  const n8nRes = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-Secret": secret },
    body: JSON.stringify({ patients: finalReady }),
    signal: AbortSignal.timeout(options.timeoutMs ?? N8N_CALL_TIMEOUT_MS),
  });

  if (!n8nRes.ok) {
    const text = await n8nRes.text().catch(() => "");
    console.error("[dispatchActivity] n8n respondeu com erro", n8nRes.status, text);
    throw new ActivityDispatchError("Falha ao acionar o envio (n8n indisponível)", "upstream");
  }

  return {
    sent: finalReady.length,
    sentPatients: finalReady.map((r) => ({
      patientId: r.patientId,
      channel: r.channel as "text" | "template",
    })),
    skipped,
  };
}
