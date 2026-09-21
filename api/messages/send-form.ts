import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../_lib/requireAdmin.js";
import { internalError } from "../_lib/errorResponse.js";
import { dispatchReminders } from "../_lib/dispatchReminders.js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MAX_PATIENTS_PER_REQUEST = 200;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Qualquer staff autenticado pode disparar — a mesma permissão que já tem
  // pra ver/editar a lista de pacientes hoje. Não exige admin.
  const callerId = await requireUser(req, res, supabaseAdmin);
  if (!callerId) return;

  const body = (req.body ?? {}) as { patientIds?: unknown };
  const patientIds = Array.isArray(body.patientIds)
    ? body.patientIds.filter((id): id is string => typeof id === "string")
    : [];

  if (patientIds.length === 0) {
    return res.status(400).json({ error: "patientIds é obrigatório e não pode ser vazio" });
  }
  if (patientIds.length > MAX_PATIENTS_PER_REQUEST) {
    return res.status(400).json({ error: `Máximo de ${MAX_PATIENTS_PER_REQUEST} pacientes por disparo` });
  }

  try {
    const result = await dispatchReminders(patientIds);
    return res.status(200).json(result);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Falha ao acionar")) {
      return res.status(502).json({ error: e.message });
    }
    if (e instanceof Error && e.message.startsWith("Integração de envio")) {
      return res.status(500).json({ error: e.message });
    }
    return internalError(res, "messages/send-form", e);
  }
}