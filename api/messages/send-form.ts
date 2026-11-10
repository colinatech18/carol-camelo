import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../_lib/requireAdmin.js";
import { internalError } from "../_lib/errorResponse.js";
import { dispatchReminders, DispatchError } from "../_lib/dispatchReminders.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

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
    if (e instanceof DispatchError) {
      return res.status(e.code === "upstream" ? 502 : 500).json({ error: e.message });
    }
    return internalError(res, "messages/send-form", e);
  }
}