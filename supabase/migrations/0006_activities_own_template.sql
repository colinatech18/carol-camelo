-- Cada atividade passa a ter seu PRÓPRIO template de WhatsApp (Meta), em vez
-- de reaproveitar o template do lembrete do diário. Um template aprovado tem
-- texto fixo (ex: "não esqueça de preencher seu diário..."), então reusar o
-- mesmo template pra uma atividade diferente mandaria uma mensagem com texto
-- errado. Rode depois de 0005_activities.sql.

alter table activities
  add column if not exists whatsapp_template_id uuid references whatsapp_templates(id);
