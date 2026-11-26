-- `profiles` estava com uma policy "allow all" (ALL, role `public`, qual `true`),
-- ou seja, sem RLS de fato: qualquer requisição anônima (anon key, pública em
-- qualquer bundle JS do site) conseguia ler todos os perfis, alterar o `role`
-- de qualquer um (inclusive se promovendo a admin — vários outros RLS do
-- sistema dependem de profiles.role = 'admin') e apagar perfis. Encontrado e
-- corrigido na auditoria de RLS de 2026-11-26. Rode este SQL no SQL Editor do
-- Supabase (não há Supabase CLI configurado no repo).
--
-- O client só precisa de SELECT geral (lista da equipe) e UPDATE do próprio
-- registro (renomear a si mesmo). Criar/editar role/apagar usuário já passam
-- por api/create-user.ts, api/update-user.ts e api/delete-user.ts, que usam
-- a service_role (bypassa RLS) com checagem de admin — não precisam de policy
-- de client para isso.

drop policy if exists "allow all" on public.profiles;

create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- `notifications` tem a mesma policy "allow all" (ALL, public, true), mas
-- nenhum código ativo a referencia (só os arquivos mortos
-- src/services/mockBackend.ts e src/services/api.ts, sem imports). Deixada
-- como está por decisão explícita — não corrigida nesta migração.
