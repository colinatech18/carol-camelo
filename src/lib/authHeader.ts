import { supabase } from "@/lib/supabase";

/**
 * Monta o header Authorization com o access_token da sessão atual do Supabase
 * Auth. As rotas /api/create-user, /api/update-user e /api/delete-user exigem
 * esse header (ver api/_lib/requireAdmin.ts) — sem ele, todas retornam 401.
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}