import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
// Fonte única dos IDs de pergunta válidos (mesma constante do formulário público).
import { VALID_QUESTION_IDS } from "../../src/lib/formQuestions";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Formato exato que useEnrichedPatients já espera dentro do jsonb `responses`.
type Answer = { questionId: string; value: number; note?: string };

// Valida e NORMALIZA o array de respostas. Retorna null se qualquer item for inválido,
// para o handler responder 400. Só campos conhecidos entram (nada de lixo do cliente).
function parseAnswers(input: unknown): Answer[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const out: Answer[] = [];
  for (const item of input) {
    if (typeof item !== "object" || item === null) return null;
    const { questionId, value, note } = item as Record<string, unknown>;
    if (typeof questionId !== "string" || !VALID_QUESTION_IDS.includes(questionId)) return null;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) return null;
    if (note !== undefined && typeof note !== "string") return null;
    out.push(note !== undefined ? { questionId, value, note } : { questionId, value });
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = (req.body ?? {}) as { token?: unknown; answers?: unknown };

  const token = typeof body.token === "string" && body.token.trim() ? body.token : null;
  if (!token) return res.status(400).json({ error: "token ausente ou inválido" });

  const answers = parseAnswers(body.answers);
  if (!answers) {
    return res.status(400).json({
      error:
        "answers inválido: array não-vazio de { questionId ∈ [q1..q5], value inteiro 1-5, note? string }",
    });
  }

  // O patient_id vem SÓ do token (nunca do cliente): o token é a única credencial que
  // liga a resposta ao paciente correto. O corpo não carrega patient_id.
  const { data: patient, error: lookupError } = await supabaseAdmin
    .from("patients")
    .select("id")
    .eq("public_token", token)
    .maybeSingle();

  if (lookupError) return res.status(500).json({ error: lookupError.message });
  if (!patient) return res.status(404).json({ error: "not_found" });

  // submitted_at é gerado no servidor — nunca recebido do cliente.
  const now = new Date();
  const submittedAt = now.toISOString();

  // Dedup: uma resposta por paciente por dia. Janela em UTC para casar com o
  // `submitted_at.slice(0,10)` que useEnrichedPatients usa como "data" na leitura.
  // Escolha: BLOQUEAR (409), não sobrescrever — não-destrutivo e adequado a um diário
  // diário (o paciente responde uma vez por dia).
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
  const dayEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  ).toISOString();

  const { data: existing, error: dupError } = await supabaseAdmin
    .from("form_responses")
    .select("id")
    .eq("patient_id", patient.id)
    .gte("submitted_at", dayStart)
    .lt("submitted_at", dayEnd)
    .limit(1);

  if (dupError) return res.status(500).json({ error: dupError.message });
  if (existing && existing.length > 0) {
    return res.status(409).json({ error: "already_submitted_today" });
  }

  const { error: insertError } = await supabaseAdmin.from("form_responses").insert({
    patient_id: patient.id,
    token,
    responses: answers,
    submitted_at: submittedAt,
  });

  if (insertError) return res.status(500).json({ error: insertError.message });

  return res.status(200).json({ ok: true });
}
