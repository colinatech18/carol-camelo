-- Simplifica Atividades: só disparo manual ("Enviar agora"), sem agendamento
-- nem recorrência. Remove as colunas de agendamento que ficaram sem uso (e o
-- endpoint api/cron/activities.ts, que as lia, foi removido do código) —
-- dispensa o gatilho periódico no n8n que esse modo exigiria.

alter table activities
  drop column if exists schedule_type,
  drop column if exists scheduled_at,
  drop column if exists recurrence,
  drop column if exists recurrence_weekday,
  drop column if exists recurrence_program_day,
  drop column if exists dispatch_time,
  drop column if exists dispatch_active;
