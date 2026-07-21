-- Tabela `prontuario_notes`: anotações clínicas (psicológicas e psiquiátricas) por paciente.
-- Rode este SQL no SQL Editor do Supabase (não há Supabase CLI configurado no repo).
--
-- Imutabilidade por design: só há policies de SELECT e INSERT. Sem policy de UPDATE/DELETE,
-- com RLS habilitado, essas operações são NEGADAS para authenticated e anon — a garantia
-- vive no banco, não só na UI. author_id referencia auth.users(id) (o usuário logado).

create table prontuario_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  author_id uuid not null references auth.users(id),
  note_type text not null check (note_type in ('psicologica', 'psiquiatrica')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table prontuario_notes enable row level security;

-- Leitura: qualquer staff autenticado, ambas categorias
create policy "staff read all" on prontuario_notes
  for select to authenticated using (true);

-- Escrita: staff autenticado só pode inserir anotações em seu próprio nome
-- (author_id tem que ser o próprio usuário logado — não dá pra forjar autoria de outro).
create policy "staff insert" on prontuario_notes
  for insert to authenticated with check (author_id = auth.uid());

-- Nenhuma policy de UPDATE ou DELETE é criada de propósito —
-- isso bloqueia essas operações por padrão pra qualquer papel,
-- garantindo imutabilidade no nível do banco, não só na UI.
