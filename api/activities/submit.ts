import type { VercelRequest, VercelResponse } from "@vercel/node";
import { internalError } from "../_lib/errorResponse.js";
import { validateFormAnswers, type FormField } from "../_lib/formValidation.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = (req.body ?? {}) as { token?: unknown; activityId?: unknown; answers?: unknown };
  const token = typeof body.token === "string" && body.token.trim() ? body.token : null;
  const activityId =
    typeof body.activityId === "string" && body.activityId ? body.activityId : null;
  if (!token || !activityId)
    return res.status(400).json({ error: "token e activityId são obrigatórios" });

  // patient_id vem SÓ do token, nunca do cliente — mesmo cuidado de
  // api/forms/submit.ts.
  const { data: patient, error: lookupError } = await supabaseAdmin
    .from("patients")
    .select("id")
    .eq("public_token", token)
    .maybeSingle();
  if (lookupError) return internalError(res, "activities/submit:lookup", lookupError);
  if (!patient) return res.status(404).json({ error: "not_found" });

  const { data: activity, error: activityError } = await supabaseAdmin
    .from("activities")
    .select("id, status, fields, target_mode, target_patient_ids")
    .eq("id", activityId)
    .maybeSingle();
  if (activityError) return internalError(res, "activities/submit:activity", activityError);
  if (!activity || activity.status !== "active")
    return res.status(404).json({ error: "activity_unavailable" });

  // Confirma que esta atividade está mesmo direcionada a este paciente —
  // impede responder uma atividade endereçada a outro grupo específico.
  if (
    activity.target_mode === "selected" &&
    !(activity.target_patient_ids ?? []).includes(patient.id)
  ) {
    return res.status(404).json({ error: "activity_unavailable" });
  }

  const answers = validateFormAnswers((activity.fields ?? []) as FormField[], body.answers);
  if (!answers) return res.status(400).json({ error: "answers inválido para esta atividade" });

  // Upsert por (activity_id, patient_id): atividade recorrente guarda só a
  // resposta mais recente, não um histórico por disparo (ver migração 0004).
  const { error: insertError } = await supabaseAdmin.from("activity_responses").upsert(
    {
      activity_id: activity.id,
      patient_id: patient.id,
      token,
      responses: answers,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "activity_id,patient_id" },
  );
  if (insertError) return internalError(res, "activities/submit:insert", insertError);

  return res.status(200).json({ ok: true });
}
