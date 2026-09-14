import type { VercelResponse } from "@vercel/node";

/**
 * Loga o erro real no servidor e responde ao cliente com uma mensagem
 * genérica. Nunca repasse `error.message` de uma lib do Postgres/Supabase
 * direto na resposta HTTP.
 */
export function internalError(res: VercelResponse, context: string, error: unknown) {
  console.error(`[${context}]`, error);
  return res.status(500).json({ error: "internal_error" });
}