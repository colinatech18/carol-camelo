import type { VercelRequest, VercelResponse } from "@vercel/node";
// Reaproveita a MESMA lógica de dia do programa usada em toda a app (não reescrever).
import {
  programDay,
  brasiliaDateString,
  brasiliaDayStartIso,
  brasiliaNoonIso,
  recentBrasiliaDates,
  DEFAULT_CLINICAL_CONFIG,
} from "../../src/lib/criticality.js";
import { internalError } from "../_lib/errorResponse.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

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

  // Busca `app_settings` uma única vez: serve tanto para o formulário padrão
  // (fallback quando o paciente não tem um específico) quanto para os
  // parâmetros clínicos configuráveis (duração do programa, janela de
  // preenchimento retroativo).
  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("app_settings")
    .select("default_form_id, program_length_days, backfill_days")
    .eq("id", true)
    .maybeSingle();
  if (settingsError) return internalError(res, "forms/get-by-token:settings", settingsError);

  const programLengthDays =
    settings?.program_length_days ?? DEFAULT_CLINICAL_CONFIG.programLengthDays;
  const backfillDays = settings?.backfill_days ?? DEFAULT_CLINICAL_CONFIG.backfillDays;

  // Formulário atribuído a este paciente; se nenhum, cai no padrão do sistema.
  let formId = patient.assigned_form_id as string | null;
  if (!formId) {
    formId = settings?.default_form_id ?? null;
  }
  if (!formId) return res.status(404).json({ error: "no_form_configured" });

  const { data: form, error: formError } = await supabaseAdmin
    .from("forms")
    .select("id, name, description, fields, status")
    .eq("id", formId)
    .maybeSingle();

  if (formError) return internalError(res, "forms/get-by-token:form", formError);
  if (!form || form.status === "archived")
    return res.status(404).json({ error: "form_unavailable" });

  // Dias dos últimos `backfillDays` que ainda não têm resposta — permite o
  // paciente preencher um dia que ficou sem responder, não só "hoje".
  const windowDates = recentBrasiliaDates(backfillDays);
  const windowStartIso = brasiliaDayStartIso(new Date(brasiliaNoonIso(windowDates[0])));

  const { data: recentResponses, error: responsesError } = await supabaseAdmin
    .from("form_responses")
    .select("submitted_at")
    .eq("patient_id", patient.id)
    .gte("submitted_at", windowStartIso);
  if (responsesError) return internalError(res, "forms/get-by-token:responses", responsesError);

  const answeredDates = new Set(
    (recentResponses ?? []).map((r: any) => brasiliaDateString(new Date(r.submitted_at))),
  );
  const startDate = patient.program_start_date as string | null;

  const openDays = windowDates
    .filter((d) => !answeredDates.has(d) && (!startDate || d >= startDate))
    .map((d) => ({
      date: d,
      programDay: programDay(
        patient.program_start_date,
        new Date(brasiliaNoonIso(d)),
        programLengthDays,
      ),
    }));

  return res.status(200).json({
    patientId: patient.id,
    name: patient.name,
    programDay: programDay(patient.program_start_date, new Date(), programLengthDays),
    openDays,
    form: {
      id: form.id,
      name: form.name,
      description: form.description,
      fields: form.fields,
    },
  });
}
