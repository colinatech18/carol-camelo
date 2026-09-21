import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { internalError } from "../_lib/errorResponse.js";
import { dispatchReminders } from "../_lib/dispatchReminders.js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DAYS_THRESHOLD = 2;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Chamado pelo n8n (agendamento diário), não por uma pessoa logada — usa
  // segredo próprio, não o login de staff (requireUser).
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "CRON_SECRET não configurado" });
  }
  const header = req.headers["x-cron-secret"];
  const provided = Array.isArray(header) ? header[0] : header;
  if (!provided || provided !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Pacientes ativos (não arquivados). Pra cada um, calcula há quantos dias
  // foi a última resposta — se nunca respondeu, usa a data de início do
  // programa como referência.
  const { data: patients, error: patientsError } = await supabaseAdmin
    .from("patients")
    .select("id, program_start_date")
    .is("archived_at", null);
  if (patientsError) return internalError(res, "cron/no-response:patients", patientsError);

  const patientIds = (patients ?? []).map((p: any) => p.id as string);
  if (patientIds.length === 0) {
    return res.status(200).json({ candidates: 0, sent: 0, skipped: [] });
  }

  const { data: responses, error: responsesError } = await supabaseAdmin
    .from("form_responses")
    .select("patient_id, submitted_at")
    .in("patient_id", patientIds)
    .order("submitted_at", { ascending: false });
  if (responsesError) return internalError(res, "cron/no-response:responses", responsesError);

  const lastResponseByPatient = new Map<string, string>();
  for (const row of responses ?? []) {
    if (!lastResponseByPatient.has(row.patient_id)) {
      lastResponseByPatient.set(row.patient_id, row.submitted_at);
    }
  }

  const now = Date.now();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const candidates = (patients ?? [])
    .map((p: any) => {
      const lastResponse = lastResponseByPatient.get(p.id);
      const referenceDate = lastResponse ?? p.program_start_date;
      if (!referenceDate) return null;
      const daysSince = Math.floor((now - new Date(referenceDate).getTime()) / MS_PER_DAY);
      return { id: p.id as string, daysSince };
    })
    .filter((p): p is { id: string; daysSince: number } => p !== null && p.daysSince >= DAYS_THRESHOLD)
    .map((p) => p.id);

  if (candidates.length === 0) {
    return res.status(200).json({ candidates: 0, sent: 0, skipped: [] });
  }

  try {
    const result = await dispatchReminders(candidates);
    return res.status(200).json({ candidates: candidates.length, ...result });
  } catch (e) {
    console.error("[cron/no-response] erro ao disparar", e);
    return res.status(502).json({ error: e instanceof Error ? e.message : "Erro ao disparar" });
  }
}