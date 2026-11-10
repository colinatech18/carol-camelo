import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "./_lib/requireAdmin.js";
import { internalError } from "./_lib/errorResponse.js";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

const ROLES = ["admin", "psicologo", "psiquiatra", "recepcionista"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Só admin autenticado pode criar novos usuários de staff.
  const callerId = await requireAdmin(req, res, supabaseAdmin);
  if (!callerId) return; // requireAdmin já escreveu a resposta de erro (401/403)

  const { name, email: rawEmail, password, role } = req.body ?? {};
  if (!name || !rawEmail || !password || !role) {
    return res.status(400).json({ error: "Campos obrigatórios ausentes" });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: "role inválida" });
  }

  // Normaliza antes de gravar/comparar — sem isso, " Ana@X.com " e "ana@x.com"
  // viram duas contas diferentes aos olhos do app (ainda que o Supabase Auth
  // normalize por baixo dos panos, o que gera mensagem de "já existe" confusa).
  const email = String(rawEmail).trim().toLowerCase();

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

  // `profiles` é de onde a app lê nome/papel/e-mail. O banco pode já ter criado
  // essa linha sozinho (gatilho em auth.users a partir do user_metadata), então
  // um INSERT puro falharia por duplicidade. O upsert cobre os dois casos: cria
  // se não existir, atualiza se já existir — e sempre manda o e-mail.
  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    { id: data.user.id, name, email: data.user.email ?? email, role },
    { onConflict: "id" },
  );

  if (profileError) {
    // Não deixa um login "fantasma" sem perfil: desfaz a criação no auth.
    try {
      await supabaseAdmin.auth.admin.deleteUser(data.user.id);
    } catch (rollbackError) {
      // O rollback falhou: o usuário ficou no auth.users sem perfil correspondente.
      // Loga com o id pra permitir limpeza manual, em vez de descartar o erro.
      console.error(
        `create-user: FALHA NO ROLLBACK, usuário órfão criado (id=${data.user.id})`,
        rollbackError,
      );
    }
    return internalError(res, "create-user:profile", profileError);
  }

  return res.status(200).json({ id: data.user.id });
}