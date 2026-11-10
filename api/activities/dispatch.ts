import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../_lib/requireAdmin.js";
import { internalError } from "../_lib/errorResponse.js";
import { dispatchActivityToPatients, ActivityDispatchError } from "../_lib/dispatchActivity.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Qualquer staff autenticado pode disparar manualmente — mesma permissão
  // que já existe pra disparar o lembrete do diário (api/messages/send-form.ts).
  const callerId = await requireUser(req, res, supabaseAdmin);
  if (!callerId) return;

  const body = (req.body ?? {}) as { activityId?: unknown };
  const activityId = typeof body.activityId === "string" ? body.activityId : "";
  if (!activityId) return res.status(400).json({ error: "activityId é obrigatório" });

  const { data: activity, error: activityError } = await supabaseAdmin
    .from("activities")
    .select("id, status, target_mode, target_patient_ids, message_template, whatsapp_template_id")
    .eq("id", activityId)
    .maybeSingle();
  if (activityError) return internalError(res, "activities/dispatch:activity", activityError);
  if (!activity) return res.status(404).json({ error: "not_found" });
  if (activity.status !== "active") {
    return res.status(409).json({ error: "activity_not_active" });
  }

  let patientsQuery = supabaseAdmin
    .from("patients")
    .select("id, name, phone, public_token, archived_at");
  if (activity.target_mode === "selected") {
    const ids = (activity.target_patient_ids ?? []) as string[];
    if (ids.length === 0) return res.status(200).json({ sent: 0, skipped: [] });
    patientsQuery = patientsQuery.in("id", ids);
  } else {
    patientsQuery = patientsQuery.eq("status", "active").is("archived_at", null);
  }

  const { data: patients, error: patientsError } = await patientsQuery;
  if (patientsError) return internalError(res, "activities/dispatch:patients", patientsError);
  if (!patients || patients.length === 0) return res.status(200).json({ sent: 0, skipped: [] });

  try {
    const result = await dispatchActivityToPatients(
      patients as any,
      activity.message_template ?? "",
      activity.whatsapp_template_id ?? null,
    );

    if (result.sentPatients.length > 0) {
      const { error: logError } = await supabaseAdmin.from("activity_dispatch_log").insert(
        result.sentPatients.map((r) => ({
          activity_id: activityId,
          patient_id: r.patientId,
          channel: r.channel,
          status: "sent",
        })),
      );
      if (logError) console.error("[activities/dispatch] falha ao gravar log", logError);
    }

    return res.status(200).json({ sent: result.sent, skipped: result.skipped });
  } catch (e) {
    if (e instanceof ActivityDispatchError) {
      return res.status(e.code === "upstream" ? 502 : 500).json({ error: e.message });
    }
    return internalError(res, "activities/dispatch", e);
  }
}
