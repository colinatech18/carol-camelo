import type { VercelResponse } from "@vercel/node";

/**
 * Loga o erro real no servidor (visível nos logs da Vercel) e responde ao
 * cliente com uma mensagem genérica. Nunca repasse `error.message` de uma
 * lib do Postgres/Supabase direto na resposta HTTP — isso pode vazar nomes
 * de coluna, constraints ou outros detalhes internos do schema para quem
 * está do lado de fora, especialmente relevante nos endpoints públicos
 * (get-by-token, submit).
 */
export function internalError(res: VercelResponse, context: string, error: unknown) {
  console.error(`[${context}]`, error);
  return res.status(500).json({ error: "internal_error" });
}