import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "./_lib/requireAdmin";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ROLES = ["admin", "psicologo", "psiquiatra", "recepcionista"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const callerId = await requireAdmin(req, res, supabaseAdmin);
  if (!callerId) return;

  const body = (req.body ?? {}) as { id?: unknown; name?: unknown; role?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = typeof body.role === "string" ? body.role : "";
  if (!id || !name || !ROLES.includes(role)) {
    return res.status(400).json({ error: "id, name e role (válido) são obrigatórios" });
  }

  // Se a mudança tira o próprio admin logado do papel de admin (rebaixando a si
  // mesmo), confirma que sobra pelo menos mais um admin no sistema — senão a
  // gestão de usuários fica sem ninguém que consiga administrar.
  if (id === callerId && role !== "admin") {
    const { count, error: countError } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if (countError) {
      console.error("update-user: erro ao contar admins", countError);
      return res.status(500).json({ error: "internal_error" });
    }
    if ((count ?? 0) <= 1) {
      return res.status(409).json({
        error: "Não é possível remover o último administrador do sistema",
      });
    }
  }

  const { error: pErr } = await supabaseAdmin
    .from("profiles")
    .update({ name, role })
    .eq("id", id);
  if (pErr) {
    console.error("update-user: erro ao atualizar profile", pErr);
    return res.status(500).json({ error: "internal_error" });
  }

  const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(id, {
    user_metadata: { name, role },
  });
  if (authUpdateError) {
    // Não falha a requisição por isso (profiles já é a fonte de verdade lida pela
    // app), mas registra pra não passar despercebido.
    console.error("update-user: user_metadata ficou dessincronizado", authUpdateError);
  }

  return res.status(200).json({ ok: true });
}