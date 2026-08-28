import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { internalError } from "../_lib/errorResponse.js";
import { validateFormAnswers, type FormField } from "../_lib/formValidation.js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = (req.body ?? {}) as { token?: unknown; answers?: unknown };
  const token = typeof body.token === "string" && body.token.trim() ? body.token : null;
  if (!token) return res.status(400).json({ error: "token ausente ou inválido" });

  // patient_id e o formulário aplicável vêm SÓ do token — nunca do cliente. Isso
  // impede um cliente malicioso de submeter respostas formatadas para um
  // formulário diferente do que o paciente de fato recebeu.
  const { data: patient, error: lookupError } = await supabaseAdmin
    .from("patients")
    .select("id, assigned_form_id")
    .eq("public_token", token)
    .maybeSingle();

  if (lookupError) return internalError(res, "forms/submit:lookup", lookupError);
  if (!patient) return res.status(404).json({ error: "not_found" });

  let formId = patient.assigned_form_id as string | null;
  if (!formId) {
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .select("default_form_id")
      .eq("id", true)
      .maybeSingle();
    if (settingsError) return internalError(res, "forms/submit:settings", settingsError);
    formId = settings?.default_form_id ?? null;
  }
  if (!formId) return res.status(404).json({ error: "no_form_configured" });

  const { data: form, error: formError } = await supabaseAdmin
    .from("forms")
    .select("id, fields, status")
    .eq("id", formId)
    .maybeSingle();
  if (formError) return internalError(res, "forms/submit:form", formError);
  if (!form || form.status === "archived") return res.status(404).json({ error: "form_unavailable" });

  const answers = validateFormAnswers((form.fields ?? []) as FormField[], body.answers);
  if (!answers) {
    return res.status(400).json({ error: "answers inválido para este formulário" });
  }

  const submittedAt = new Date().toISOString();

  // Dedup "uma resposta por paciente por dia" garantida por constraint UNIQUE no
  // banco (ver supabase/form_responses_unique_daily.sql) — não por SELECT prévio.
  const { error: insertError } = await supabaseAdmin.from("form_responses").insert({
    patient_id: patient.id,
    form_id: form.id,
    token,
    responses: answers,
    submitted_at: submittedAt,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return res.status(409).json({ error: "already_submitted_today" });
    }
    return internalError(res, "forms/submit:insert", insertError);
  }

  return res.status(200).json({ ok: true });
}