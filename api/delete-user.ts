import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "./_lib/requireAdmin.js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const callerId = await requireAdmin(req, res, supabaseAdmin);
  if (!callerId) return;

  const { id } = (req.body ?? {}) as { id?: unknown };
  if (typeof id !== "string" || !id) {
    return res.status(400).json({ error: "id é obrigatório" });
  }

  // Impede que um admin se autodelete por engano (evita ficar sem acesso de
  // administração no meio de uma sessão, ou por clique acidental).
  if (id === callerId) {
    return res.status(409).json({ error: "Você não pode excluir sua própria conta" });
  }

  // Impede apagar o último admin do sistema, mesmo que seja outro admin fazendo
  // a exclusão de um terceiro.
  const { data: targetProfile, error: targetError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", id)
    .maybeSingle();

  if (targetError) {
    console.error("delete-user: erro ao consultar profile alvo", targetError);
    return res.status(500).json({ error: "internal_error" });
  }

  if (targetProfile?.role === "admin") {
    const { count, error: countError } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if (countError) {
      console.error("delete-user: erro ao contar admins", countError);
      return res.status(500).json({ error: "internal_error" });
    }
    if ((count ?? 0) <= 1) {
      return res.status(409).json({
        error: "Não é possível excluir o último administrador do sistema",
      });
    }
  }

  // Apaga a conta de LOGIN primeiro (mata o acesso). O pior caso passa a ser um
  // profile órfão, que a app nunca carrega — nunca um login vivo sem profile.
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (authError) {
    console.error("delete-user: erro ao deletar do auth", authError);
    return res.status(400).json({ error: authError.message });
  }

  // Limpeza best-effort do profile (pode já ter saído por cascade). Erro aqui não
  // reverte a exclusão do login, então não falhamos a requisição por causa dele.
  const { error: profileDeleteError } = await supabaseAdmin
    .from("profiles")
    .delete()
    .eq("id", id);
  if (profileDeleteError) {
    console.error("delete-user: erro ao limpar profile (best-effort)", profileDeleteError);
  }

  return res.status(200).json({ ok: true });
}