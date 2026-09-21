import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../_lib/requireAdmin.js";
import { internalError } from "../_lib/errorResponse.js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MAX_PATIENTS_PER_REQUEST = 50;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Exclusão permanente é restrita a admin — ação irreversível que apaga
  // inclusive anotações de prontuário (normalmente imutáveis por design).
  const callerId = await requireAdmin(req, res, supabaseAdmin);
  if (!callerId) return;

  const body = (req.body ?? {}) as { patientIds?: unknown };
  const patientIds = Array.isArray(body.patientIds)
    ? body.patientIds.filter((id): id is string => typeof id === "string")
    : [];

  if (patientIds.length === 0) {
    return res.status(400).json({ error: "patientIds é obrigatório e não pode ser vazio" });
  }
  if (patientIds.length > MAX_PATIENTS_PER_REQUEST) {
    return res.status(400).json({ error: `Máximo de ${MAX_PATIENTS_PER_REQUEST} pacientes por vez` });
  }

  const { data: patients, error: fetchError } = await supabaseAdmin
    .from("patients")
    .select("id, archived_at")
    .in("id", patientIds);
  if (fetchError) return internalError(res, "patients/delete:fetch", fetchError);

  const found = new Map((patients ?? []).map((p: any) => [p.id as string, p]));

  const deleted: string[] = [];
  const skipped: Array<{ patientId: string; reason: "not_found" | "not_archived" }> = [];

  // Só apaga paciente já arquivado — trava de segurança contra exclusão
  // acidental de paciente ativo.
  const toDelete: string[] = [];
  for (const id of patientIds) {
    const p = found.get(id);
    if (!p) {
      skipped.push({ patientId: id, reason: "not_found" });
      continue;
    }
    if (!p.archived_at) {
      skipped.push({ patientId: id, reason: "not_archived" });
      continue;
    }
    toDelete.push(id);
  }

  if (toDelete.length === 0) {
    return res.status(200).json({ deleted, skipped });
  }

  // Apaga em cascata manual, na ordem certa (tabelas que referenciam
  // patients primeiro). Algumas dessas tabelas (prontuario_notes,
  // prontuario_access_log) não têm policy de DELETE pra ninguém — só a
  // service_role consegue, que é exatamente o que esta rota usa.
  for (const table of ["messages", "form_responses", "appointments", "prontuario_notes", "prontuario_access_log"]) {
    const { error } = await supabaseAdmin.from(table).delete().in("patient_id", toDelete);
    if (error) return internalError(res, `patients/delete:${table}`, error);
  }

  const { error: deletePatientsError } = await supabaseAdmin
    .from("patients")
    .delete()
    .in("id", toDelete);
  if (deletePatientsError) return internalError(res, "patients/delete:patients", deletePatientsError);

  deleted.push(...toDelete);
  return res.status(200).json({ deleted, skipped });
}