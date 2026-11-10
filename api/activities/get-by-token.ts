import type { VercelRequest, VercelResponse } from "@vercel/node";
import { internalError } from "../_lib/errorResponse.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const raw = req.query.token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "token ausente" });
  }

  // Só as colunas necessárias — mesmo cuidado de api/forms/get-by-token.ts:
  // este endpoint é público (só protegido pelo token).
  const { data: patient, error: patientError } = await supabaseAdmin
    .from("patients")
    .select("id, name")
    .eq("public_token", token)
    .maybeSingle();
  if (patientError) return internalError(res, "activities/get-by-token:patient", patientError);
  if (!patient) return res.status(404).json({ error: "not_found" });

  // Atividades ativas direcionadas a "todos os pacientes ativos" OU que
  // incluem este paciente especificamente em `target_patient_ids`.
  const { data: activities, error: activitiesError } = await supabaseAdmin
    .from("activities")
    .select("id, name, description, fields")
    .eq("status", "active")
    .or(`target_mode.eq.all_active,target_patient_ids.cs.{${patient.id}}`);
  if (activitiesError)
    return internalError(res, "activities/get-by-token:activities", activitiesError);

  const activityIds = (activities ?? []).map((a: any) => a.id as string);
  let answeredIds = new Set<string>();
  if (activityIds.length > 0) {
    const { data: responses, error: responsesError } = await supabaseAdmin
      .from("activity_responses")
      .select("activity_id")
      .eq("patient_id", patient.id)
      .in("activity_id", activityIds);
    if (responsesError)
      return internalError(res, "activities/get-by-token:responses", responsesError);
    answeredIds = new Set((responses ?? []).map((r: any) => r.activity_id as string));
  }

  return res.status(200).json({
    patientId: patient.id,
    name: patient.name,
    activities: (activities ?? []).map((a: any) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      fields: a.fields,
      answered: answeredIds.has(a.id),
    })),
  });
}
