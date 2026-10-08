import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { internalError } from "../_lib/errorResponse.js";
import { dispatchReminders, type DispatchResult } from "../_lib/dispatchReminders.js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// O n8n só responde quando termina de enviar todos os pacientes do lote, então
// lotes menores + timeout maior evitam estourar a espera em listas grandes.
const BATCH_SIZE = 25;
const BATCH_TIMEOUT_MS = 45_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Chamado pelo n8n (agendamento diário), não por uma pessoa logada — usa
  // segredo próprio, não o login de staff.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "CRON_SECRET não configurado" });
  }
  const header = req.headers["x-cron-secret"];
  const provided = Array.isArray(header) ? header[0] : header;
  if (!provided || provided !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Todo paciente com status "Ativo" e não arquivado recebe o formulário todo
  // dia. Pausado, concluído e arquivado ficam de fora.
  const { data: patients, error: patientsError } = await supabaseAdmin
    .from("patients")
    .select("id")
    .eq("status", "active")
    .is("archived_at", null);
  if (patientsError) return internalError(res, "cron/daily-form:patients", patientsError);

  const activeIds = (patients ?? []).map((p: any) => p.id as string);
  if (activeIds.length === 0) {
    return res.status(200).json({ active: 0, alreadyAnswered: 0, targeted: 0, sent: 0, skipped: [] });
  }

  // Quem já respondeu hoje não precisa receber de novo (é 1 resposta por dia).
  // "Hoje" em UTC, a mesma janela da constraint form_responses_patient_date_uniq.
  const now = new Date();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();

  const { data: todays, error: todaysError } = await supabaseAdmin
    .from("form_responses")
    .select("patient_id")
    .in("patient_id", activeIds)
    .gte("submitted_at", dayStart);
  if (todaysError) return internalError(res, "cron/daily-form:responses", todaysError);

  const answeredToday = new Set((todays ?? []).map((r: any) => r.patient_id as string));
  const targets = activeIds.filter((id) => !answeredToday.has(id));

  let sent = 0;
  const skipped: DispatchResult["skipped"] = [];
  let failedBatches = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    try {
      const result = await dispatchReminders(batch, { timeoutMs: BATCH_TIMEOUT_MS });
      sent += result.sent;
      skipped.push(...result.skipped);
    } catch (e) {
      // Um lote falhar não pode impedir os outros de saírem.
      failedBatches += 1;
      console.error("[cron/daily-form] lote falhou", e);
    }
  }

  const summary = {
    active: activeIds.length,
    alreadyAnswered: answeredToday.size,
    targeted: targets.length,
    sent,
    skipped,
    failedBatches,
  };

  // 502 quando algum lote falhou: a execução aparece em vermelho no n8n.
  return res.status(failedBatches > 0 ? 502 : 200).json(summary);
}