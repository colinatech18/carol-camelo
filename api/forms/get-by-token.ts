import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
// Reaproveita a MESMA lógica de dia do programa usada em toda a app (não reescrever).
import { programDay } from "../../src/lib/criticality.js";
import { internalError } from "../_lib/errorResponse.js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const raw = req.query.token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "token ausente" });
  }

  // Só as colunas necessárias. NUNCA selecionar CPF, diagnóstico, medicações,
  // contato de emergência etc. — este endpoint é público (só protegido pelo token).
  const { data: patient, error: patientError } = await supabaseAdmin
    .from("patients")
    .select("id, name, program_start_date, assigned_form_id")
    .eq("public_token", token)
    .maybeSingle();

  if (patientError) return internalError(res, "forms/get-by-token:patient", patientError);
  if (!patient) return res.status(404).json({ error: "not_found" });

  // Formulário atribuído a este paciente; se nenhum, cai no padrão do sistema.
  let formId = patient.assigned_form_id as string | null;
  if (!formId) {
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .select("default_form_id")
      .eq("id", true)
      .maybeSingle();
    if (settingsError) return internalError(res, "forms/get-by-token:settings", settingsError);
    formId = settings?.default_form_id ?? null;
  }
  if (!formId) return res.status(404).json({ error: "no_form_configured" });

  const { data: form, error: formError } = await supabaseAdmin
    .from("forms")
    .select("id, name, description, fields, status")
    .eq("id", formId)
    .maybeSingle();

  if (formError) return internalError(res, "forms/get-by-token:form", formError);
  if (!form || form.status === "archived") return res.status(404).json({ error: "form_unavailable" });

  return res.status(200).json({
    patientId: patient.id,
    name: patient.name,
    programDay: programDay(patient.program_start_date),
    form: {
      id: form.id,
      name: form.name,
      description: form.description,
      fields: form.fields,
    },
  });
}