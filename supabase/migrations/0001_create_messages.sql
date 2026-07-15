-- Tabela `messages`: histórico de mensagens (inbound/outbound) por telefone.
-- Rode este SQL no SQL Editor do Supabase (não há Supabase CLI configurado no repo).
--
-- patient_id é NULLABLE de propósito: null = lead (telefone ainda não vinculado
-- a nenhum paciente). Assume que public.patients.id é uuid (inferido do código).

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  phone text not null,
  patient_id uuid references public.patients (id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  content text not null,
  content_type text not null default 'text'
);

-- Índices para as consultas esperadas (por telefone, por paciente, por data).
create index if not exists messages_phone_idx on public.messages (phone);
create index if not exists messages_patient_id_idx on public.messages (patient_id);
create index if not exists messages_created_at_idx on public.messages (created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.messages enable row level security;

-- Leitura: apenas usuários autenticados (staff logado via Supabase Auth).
-- A anon key NÃO lê (a policy é restrita a `authenticated`).
drop policy if exists "messages_select_authenticated" on public.messages;
create policy "messages_select_authenticated"
  on public.messages
  for select
  to authenticated
  using (true);

-- Escrita (insert/update/delete): NENHUMA policy é criada de propósito.
-- Com RLS habilitado e sem policy de escrita, qualquer insert via anon ou
-- authenticated é NEGADO. A função de servidor (api/messages/inbound.ts) usa a
-- SUPABASE_SERVICE_ROLE_KEY, cujo papel `service_role` BYPASSA RLS — portanto só
-- ela consegue inserir. Não adicione policy de insert para anon/authenticated.
