-- Mensagem automática de WhatsApp disparada quando uma consulta é agendada
-- na agenda do paciente (configurável em Configurações > Integrações). Rode
-- este SQL no SQL Editor do Supabase (não há Supabase CLI configurado no
-- repo).
--
-- appointment_message_template: texto livre usado dentro da janela de 24h do
-- WhatsApp — nula usa o fallback embutido em api/appointments/create.ts.
-- appointment_template_id: template aprovado na Meta usado fora da janela de
-- 24h — nula faz o envio ser pulado nesse caso (sem bloquear o agendamento).

alter table app_settings
  add column if not exists appointment_message_template text,
  add column if not exists appointment_template_id uuid references whatsapp_templates(id);
