import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { DEFAULT_CLINICAL_CONFIG, type ClinicalConfig } from "@/lib/criticality";

/**
 * Parâmetros clínicos configuráveis em Configurações > Configuração Geral >
 * Parâmetros clínicos. Coluna nula (clínica nunca salvou) cai no default de
 * `DEFAULT_CLINICAL_CONFIG` — nunca falha nem fica sem valor.
 */
export async function fetchClinicalConfig(): Promise<ClinicalConfig> {
  const { data, error } = (await supabase
    .from("app_settings")
    .select(
      "program_length_days, backfill_days, no_response_alert_days, criticality_red_max, criticality_yellow_max",
    )
    .eq("id", true)
    .maybeSingle()) as any;
  if (error) throw error;
  return {
    programLengthDays: data?.program_length_days ?? DEFAULT_CLINICAL_CONFIG.programLengthDays,
    backfillDays: data?.backfill_days ?? DEFAULT_CLINICAL_CONFIG.backfillDays,
    noResponseAlertDays:
      data?.no_response_alert_days ?? DEFAULT_CLINICAL_CONFIG.noResponseAlertDays,
    criticalityRedMax: data?.criticality_red_max ?? DEFAULT_CLINICAL_CONFIG.criticalityRedMax,
    criticalityYellowMax:
      data?.criticality_yellow_max ?? DEFAULT_CLINICAL_CONFIG.criticalityYellowMax,
  };
}

export function useClinicalConfig() {
  return useQuery({
    queryKey: ["app-settings", "clinical-config"],
    queryFn: fetchClinicalConfig,
    staleTime: 60_000,
  });
}
