-- Parâmetros clínicos/de produto que antes eram constantes fixas no código e
-- passam a ser configuráveis em Configurações > Configuração Geral >
-- Parâmetros clínicos. Rode este SQL no SQL Editor do Supabase (não há
-- Supabase CLI configurado no repo).
--
-- Todas as colunas são nullable: nula = clínica ainda não configurou, e o
-- código (DEFAULT_CLINICAL_CONFIG em src/lib/criticality.ts) usa os mesmos
-- valores que eram fixos antes como fallback — nunca quebra por falta de dado.

alter table app_settings
  add column if not exists program_length_days integer,
  add column if not exists backfill_days integer,
  add column if not exists no_response_alert_days integer,
  add column if not exists criticality_red_max numeric,
  add column if not exists criticality_yellow_max numeric;

alter table app_settings
  add constraint app_settings_program_length_days_check
    check (program_length_days is null or program_length_days > 0),
  add constraint app_settings_backfill_days_check
    check (backfill_days is null or backfill_days >= 0),
  add constraint app_settings_no_response_alert_days_check
    check (no_response_alert_days is null or no_response_alert_days >= 0),
  add constraint app_settings_criticality_thresholds_check
    check (
      criticality_red_max is null
      or criticality_yellow_max is null
      or criticality_red_max < criticality_yellow_max
    );
