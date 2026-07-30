import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { id } = (req.body ?? {}) as { id?: unknown };
  if (typeof id !== "string" || !id) {
    return res.status(400).json({ error: "id é obrigatório" });
  }

  // Apaga a conta de LOGIN primeiro (mata o acesso). Antes, a remoção só apagava a
  // linha em `profiles` e deixava a conta em auth.users viva — um "usuário-fantasma"
  // que ainda conseguia logar. Deletando o auth primeiro, o pior caso é um profile
  // órfão (perfil sem usuário de auth), que a app nunca carrega — nunca um login vivo.
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (authError) return res.status(400).json({ error: authError.message });

  // Limpeza best-effort do profile (pode já ter saído por cascade). Erro aqui não
  // reverte a exclusão do login, então não falhamos a requisição por causa dele.
  await supabaseAdmin.from("profiles").delete().eq("id", id);

  return res.status(200).json({ ok: true });
}
