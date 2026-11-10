import type { VercelRequest, VercelResponse } from "@vercel/node";
import { internalError } from "../_lib/errorResponse.js";
import { validateFormAnswers, type FormField } from "../_lib/formValidation.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import {
  brasiliaDateString,
  brasiliaNoonIso,
  recentBrasiliaDates,
  DEFAULT_CLINICAL_CONFIG,
} from "../../src/lib/criticality.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = (req.body ?? {}) as { token?: unknown; answers?: unknown; answerDate?: unknown };
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

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("app_settings")
    .select("default_form_id, backfill_days")
    .eq("id", true)
    .maybeSingle();
  if (settingsError) return internalError(res, "forms/submit:settings", settingsError);
  const backfillDays = settings?.backfill_days ?? DEFAULT_CLINICAL_CONFIG.backfillDays;

  let formId = patient.assigned_form_id as string | null;
  if (!formId) {
    formId = settings?.default_form_id ?? null;
  }
  if (!formId) return res.status(404).json({ error: "no_form_configured" });

  const { data: form, error: formError } = await supabaseAdmin
    .from("forms")
    .select("id, fields, status")
    .eq("id", formId)
    .maybeSingle();
  if (formError) return internalError(res, "forms/submit:form", formError);
  if (!form || form.status === "archived")
    return res.status(404).json({ error: "form_unavailable" });

  const answers = validateFormAnswers((form.fields ?? []) as FormField[], body.answers);
  if (!answers) {
    return res.status(400).json({ error: "answers inválido para este formulário" });
  }

  // `answerDate`: qual dia esta resposta é pra valer, pra permitir preencher um
  // dia anterior que ficou sem resposta (não só "hoje"). Validado contra a
  // mesma janela oferecida em get-by-token — um valor fora dela (adulterado ou
  // obsoleto) cai pra "hoje" em vez de dar erro.
  const todayStr = brasiliaDateString();
  const allowedDates = new Set(recentBrasiliaDates(backfillDays));
  const answerDate =
    typeof body.answerDate === "string" && allowedDates.has(body.answerDate)
      ? body.answerDate
      : todayStr;

  // "Hoje" mantém o instante real do envio (precisão existente); um dia
  // retroativo usa meio-dia BRT desse dia — ver brasiliaNoonIso.
  const submittedAt =
    answerDate === todayStr ? new Date().toISOString() : brasiliaNoonIso(answerDate);

  // Dedup "uma resposta por paciente por dia" garantida por constraint UNIQUE
  // no banco — não por SELECT prévio.
  const { error: insertError } = await supabaseAdmin.from("form_responses").insert({
    patient_id: patient.id,
    form_id: form.id,
    token,
    responses: answers,
    submitted_at: submittedAt,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return res.status(409).json({ error: "already_submitted" });
    }
    return internalError(res, "forms/submit:insert", insertError);
  }

  return res.status(200).json({ ok: true });
}
