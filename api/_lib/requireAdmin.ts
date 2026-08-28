import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Extrai o JWT do header Authorization, confirma que pertence a um usuário
 * autenticado de verdade (via supabaseAdmin.auth.getUser) e checa em `profiles`
 * que esse usuário tem role = 'admin'.
 *
 * Retorna o id do admin autenticado em caso de sucesso, ou `null` depois de já
 * ter escrito a resposta de erro (401/403) no `res` — nesse caso o handler que
 * chamou só precisa dar `return`.
 *
 * Importante: isso NÃO substitui RLS. RLS protege o dado quando o cliente usa a
 * anon/authenticated key. Essas rotas usam a service_role key (que bypassa RLS
 * de propósito, para poder administrar auth.users), então a checagem de
 * autorização TEM que viver aqui, no código — não existe rede de segurança do
 * banco para uma service_role key mal usada.
 */
export async function requireAdmin(
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

  // Confirma que o token é válido e pega o usuário dono dele.
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    res.status(401).json({ error: "Token inválido ou expirado" });
    return null;
  }

  const callerId = userData.user.id;

  // Confirma que esse usuário é admin, consultando a fonte de verdade (profiles),
  // não o user_metadata (que já vimos que pode ficar dessincronizado ou, em teoria,
  // ser alvo de tentativa de manipulação por outra rota).
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