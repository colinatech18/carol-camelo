import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Extrai e valida o JWT do header Authorization — confirma que o request vem
 * de um usuário autenticado de verdade (via supabaseAdmin.auth.getUser), sem
 * exigir nenhum role específico. Use isto quando qualquer staff logado pode
 * fazer a ação; use `requireAdmin` quando só admin pode.
 *
 * Retorna o id do usuário autenticado, ou `null` depois de já ter escrito a
 * resposta de erro (401) no `res` — nesse caso o handler que chamou só
 * precisa dar `return`.
 */
export async function requireUser(
  req: VercelRequest,
  res: VercelResponse,
  supabaseAdmin: SupabaseClient,
): Promise<string | null> {
  const authHeader = req.headers.authorization;
  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = headerValue?.startsWith("Bearer ") ? headerValue.slice(7).trim() : null;

  if (!token) {
    res.status(401).json({ error: "Token de autenticação ausente" });
    return null;
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    res.status(401).json({ error: "Token inválido ou expirado" });
    return null;
  }

  return userData.user.id;
}

/**
 * Como `requireUser`, mas também exige que o usuário tenha role = 'admin' em
 * `profiles`. Use nas rotas de gestão de usuário (create/update/delete) e em
 * qualquer outra ação restrita a administradores.
 *
 * Importante: isso NÃO substitui RLS. RLS protege o dado quando o cliente usa a
 * anon/authenticated key. Estas rotas usam a service_role key (que bypassa RLS
 * de propósito), então a checagem de autorização TEM que viver aqui, no código.
 */
export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse,
  supabaseAdmin: SupabaseClient,
): Promise<string | null> {
  const callerId = await requireUser(req, res, supabaseAdmin);
  if (!callerId) return null; // requireUser já escreveu a resposta de erro (401)

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .maybeSingle();

  if (profileError) {
    console.error("requireAdmin: erro ao consultar profile", profileError);
    res.status(500).json({ error: "internal_error" });
    return null;
  }

  if (!profile || profile.role !== "admin") {
    res.status(403).json({ error: "Apenas administradores podem executar esta ação" });
    return null;
  }

  return callerId;
}