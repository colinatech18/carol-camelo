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

  // Só admin autenticado pode criar novos usuários de staff.
  const callerId = await requireAdmin(req, res, supabaseAdmin);
  if (!callerId) return; // requireAdmin já escreveu a resposta de erro (401/403)

  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "Campos obrigatórios ausentes" });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: "role inválida" });
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });

  if (error) {
    console.error("create-user: erro ao criar no auth", error);
    return res.status(400).json({ error: error.message });
  }

  // Mantém `profiles` como fonte de verdade de name/role (mesmo padrão de update-user.ts).
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .insert({ id: data.user.id, name, role });

  if (profileError) {
    // O usuário de auth já foi criado; se o profile falhar, desfaz para não deixar
    // um usuário "fantasma" sem profile (mesmo raciocínio do delete-user.ts, mas
    // ao contrário: aqui evitamos criar um estado inconsistente).
    console.error("create-user: erro ao criar profile, revertendo auth.users", profileError);
    await supabaseAdmin.auth.admin.deleteUser(data.user.id);
    return res.status(500).json({ error: "internal_error" });
  }

  return res.status(200).json({ id: data.user.id });
}