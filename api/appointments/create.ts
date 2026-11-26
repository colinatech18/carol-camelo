import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../_lib/requireAdmin.js";
import { internalError } from "../_lib/errorResponse.js";
import {
  buildTemplatePayload,
  renderTextTemplate,
  type WhatsappTemplateRow,
} from "../_lib/whatsappTemplate.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import {
  formatAppointmentDate,
  formatAppointmentTime,
  formatAppointmentDateTime,
} from "../_lib/appointmentDateTimeFormat.js";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const N8N_CALL_TIMEOUT_MS = 10_000;
const DEFAULT_MESSAGE_TEMPLATE =
  "Olá {{name}}! Sua consulta foi agendada para {{datetime}}. Qualquer dúvida, é só chamar por aqui.";

interface PatientRow {
  id: string;
  name: string;
  phone: string | null;
  archived_at: string | null;
}

/**
 * Avisa o paciente pelo WhatsApp que uma consulta foi marcada. Best-effort:
 * qualquer motivo de não ter enviado (sem telefone, fora da janela de 24h sem
 * template configurado, n8n fora do ar) é reportado em `skipReason`, nunca
 * lançado — a consulta já foi criada e não deve ser desfeita por causa do aviso.
 */
async function sendAppointmentMessage(
  patient: PatientRow,
  scheduledAtIso: string,
  professionalId: string | null,
): Promise<{ messageSent: boolean; skipReason?: string }> {
  const webhookUrl = process.env.N8N_SEND_WEBHOOK_URL;
  const secret = process.env.N8N_SEND_WEBHOOK_SECRET;
  if (!webhookUrl || !secret)
    return { messageSent: false, skipReason: "integration_not_configured" };
  if (patient.archived_at) return { messageSent: false, skipReason: "archived" };
  if (typeof patient.phone !== "string" || !patient.phone.trim()) {
    return { messageSent: false, skipReason: "no_phone" };
  }

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("app_settings")
    .select("appointment_message_template, appointment_template_id")
    .eq("id", true)
    .maybeSingle();
  if (settingsError) {
    console.error("[appointments/create:settings]", settingsError);
    return { messageSent: false, skipReason: "settings_error" };
  }

  // Mensagem de texto livre só funciona dentro da janela de 24h (regra do
  // WhatsApp) — mesmo critério usado em messages/send-manual.ts.
  const { data: lastInbound, error: inboundError } = await supabaseAdmin
    .from("messages")
    .select("created_at")
    .eq("patient_id", patient.id)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inboundError) {
    console.error("[appointments/create:inbound-lookup]", inboundError);
    return { messageSent: false, skipReason: "settings_error" };
  }
  const withinWindow = lastInbound
    ? Date.now() - new Date(lastInbound.created_at).getTime() < WINDOW_MS
    : false;

  const appointmentDate = formatAppointmentDate(scheduledAtIso);
  const appointmentTime = formatAppointmentTime(scheduledAtIso);
  const appointmentDateTime = formatAppointmentDateTime(scheduledAtIso);
  const bodyTemplateText = settings?.appointment_message_template || DEFAULT_MESSAGE_TEMPLATE;
  const message = renderTextTemplate(bodyTemplateText, {
    patientName: patient.name,
    appointmentDateTime,
  });

  let channel: "text" | "template" = "text";
  let templatePayload: ReturnType<typeof buildTemplatePayload> | undefined;

  if (!withinWindow) {
    if (!settings?.appointment_template_id) {
      return { messageSent: false, skipReason: "outside_24h_no_template" };
    }
    const { data: templateRow, error: templateError } = await supabaseAdmin
      .from("whatsapp_templates")
      .select("id, name, language, parameters")
      .eq("id", settings.appointment_template_id)
      .maybeSingle();
    if (templateError || !templateRow) {
      console.error("[appointments/create:template]", templateError);
      return { messageSent: false, skipReason: "template_not_found" };
    }
    let professionalName = "";
    if (professionalId) {
      const { data: professional, error: professionalError } = await supabaseAdmin
        .from("profiles")
        .select("name")
        .eq("id", professionalId)
        .maybeSingle();
      if (professionalError) {
        console.error("[appointments/create:professional]", professionalError);
      } else {
        professionalName = professional?.name ?? "";
      }
    }

    channel = "template";
    templatePayload = buildTemplatePayload(templateRow as WhatsappTemplateRow, {
      patientName: patient.name,
      appointmentDateTime,
      appointmentDate,
      appointmentTime,
      professionalName,
    });
  }

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
            message,
            channel,
            templatePayload,
          },
        ],
      }),
      signal: AbortSignal.timeout(N8N_CALL_TIMEOUT_MS),
    });
    if (!n8nRes.ok) {
      const text = await n8nRes.text().catch(() => "");
      console.error("[appointments/create] n8n respondeu com erro", n8nRes.status, text);
      return { messageSent: false, skipReason: "n8n_error" };
    }
  } catch (e) {
    console.error("[appointments/create] falha ao chamar o n8n", e);
    return { messageSent: false, skipReason: "n8n_error" };
  }

  return { messageSent: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Qualquer staff autenticado pode agendar — mesma permissão que já tem pra
  // ver/editar a agenda do paciente hoje.
  const callerId = await requireUser(req, res, supabaseAdmin);
  if (!callerId) return;

  const body = (req.body ?? {}) as {
    patientId?: unknown;
    professionalId?: unknown;
    scheduledAt?: unknown;
    notes?: unknown;
  };
  const patientId = typeof body.patientId === "string" ? body.patientId : "";
  const scheduledAtRaw = typeof body.scheduledAt === "string" ? body.scheduledAt : "";
  const professionalId =
    typeof body.professionalId === "string" && body.professionalId ? body.professionalId : null;
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  if (!patientId || !scheduledAtRaw) {
    return res.status(400).json({ error: "patientId e scheduledAt são obrigatórios" });
  }
  const scheduledDate = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledDate.getTime())) {
    return res.status(400).json({ error: "scheduledAt inválido" });
  }
  const scheduledAtIso = scheduledDate.toISOString();

  const { data: patient, error: patientError } = await supabaseAdmin
    .from("patients")
    .select("id, name, phone, archived_at")
    .eq("id", patientId)
    .maybeSingle();
  if (patientError) return internalError(res, "appointments/create:patient", patientError);
  if (!patient) return res.status(404).json({ error: "not_found" });

  const { data: appointment, error: insertError } = await supabaseAdmin
    .from("appointments")
    .insert({
      patient_id: patientId,
      professional_id: professionalId,
      scheduled_at: scheduledAtIso,
      status: "pending",
      notes,
    })
    .select("id")
    .single();
  if (insertError) return internalError(res, "appointments/create:insert", insertError);

  // A consulta já foi criada neste ponto — o aviso por WhatsApp é
  // best-effort e nunca desfaz o agendamento se falhar.
  const dispatch = await sendAppointmentMessage(patient as PatientRow, scheduledAtIso, professionalId);

  return res.status(200).json({ ok: true, appointmentId: appointment.id, ...dispatch });
}
