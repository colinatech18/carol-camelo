import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase único com a service role key, compartilhado por todas as
 * funções de API — evita duplicar `createClient(...)` arquivo a arquivo e
 * centraliza qualquer ajuste futuro de config (timeout, retries, região).
 */
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
