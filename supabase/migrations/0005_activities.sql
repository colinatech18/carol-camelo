-- Aba "Atividades": tarefas/questionários que a equipe clínica cadastra (com o
-- mesmo editor de perguntas de Formulários) e dispara para pacientes via
-- WhatsApp — manualmente, numa data agendada, ou recorrente (diário, semanal,
-- ou num dia específico do programa de 30 dias). Rode este SQL no SQL Editor
-- do Supabase (não há Supabase CLI configurado no repo).

create table activities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('active', 'draft', 'archived')),
  fields jsonb not null default '[]'::jsonb,

  -- Configuração de disparo. 'manual': só dispara quando a equipe clica em
  -- "Enviar agora" (api/activities/dispatch.ts). 'once': dispara sozinha uma
  -- vez em scheduled_at (api/cron/activities.ts). 'recurring': dispara
  -- sozinha repetidamente conforme `recurrence`.
  schedule_type text not null default 'manual' check (schedule_type in ('manual', 'once', 'recurring')),
  scheduled_at timestamptz, -- só 'once'
  recurrence text check (recurrence in ('daily', 'weekly', 'program_day')), -- só 'recurring'
  recurrence_weekday smallint check (recurrence_weekday between 0 and 6), -- 'weekly': 0=domingo
  recurrence_program_day integer check (recurrence_program_day > 0), -- 'program_day': dia do programa do PACIENTE, não data de calendário
  dispatch_time text not null default '09:00', -- "HH:MM" horário de Brasília, horário do dia em que o cron dispara 'recurring'
  dispatch_active boolean not null default true, -- pausa o disparo automático (once/recurring) sem apagar a configuração

  target_mode text not null default 'all_active' check (target_mode in ('all_active', 'selected')),
  target_patient_ids uuid[] not null default '{}',

  message_template text, -- texto livre da mensagem; nulo = fallback genérico no código

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table activities enable row level security;

create policy "staff read all" on activities for select to authenticated using (true);
create policy "staff insert" on activities for insert to authenticated with check (true);
create policy "staff update" on activities for update to authenticated using (true);
create policy "staff delete" on activities for delete to authenticated using (true);

-- Auditoria de cada tentativa de envio (manual ou automática), por paciente.
-- É a fonte de verdade pra "já mandei isso pra esse paciente hoje" — evita
-- disparo duplicado se o cron rodar mais de uma vez na mesma janela, e dá
-- histórico visível pra equipe.
create table activity_dispatch_log (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  dispatched_at timestamptz not null default now(),
  channel text not null check (channel in ('text', 'template')),
  status text not null check (status in ('sent', 'skipped')),
  skip_reason text
);
alter table activity_dispatch_log enable row level security;
create policy "staff read all" on activity_dispatch_log for select to authenticated using (true);
-- Sem policy de insert: só a service_role (usada pelas rotas de disparo) grava aqui.

-- Resposta do paciente a uma atividade. Upsert por (activity_id, patient_id):
-- atividades recorrentes guardam só a resposta mais recente, não histórico —
-- suficiente pra acompanhamento clínico, sem a complexidade de uma linha por
-- disparo.
create table activity_responses (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  token text,
  responses jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (activity_id, patient_id)
);
alter table activity_responses enable row level security;
create policy "staff read all" on activity_responses for select to authenticated using (true);
-- Sem policy de insert/update: só a service_role (api/activities/submit.ts) grava aqui.
