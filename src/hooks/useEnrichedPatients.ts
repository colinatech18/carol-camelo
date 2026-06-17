import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { criticalityFromResponses, daysSinceLastResponse, programDay } from "@/lib/criticality";
import type { Patient, ResponseEntry } from "@/types";

export interface EnrichedPatient extends Patient {
  responses: ResponseEntry[];
  criticality: ReturnType<typeof criticalityFromResponses>;
  daysSinceLast: number | null;
  programDay: number;
}

export function useEnrichedPatients() {
  return useQuery({
    queryKey: ["patients", "enriched"],
    queryFn: async (): Promise<EnrichedPatient[]> => {
      const [patients, allResponses] = await Promise.all([
        api.patients.list(),
        api.forms.getAllResponses(),
      ]);
      return patients.map((p) => {
        const resp = allResponses.filter((r) => r.patientId === p.id);
        return {
          ...p,
          responses: resp,
          criticality: criticalityFromResponses(resp),
          daysSinceLast: daysSinceLastResponse(resp),
          programDay: programDay(p.startDate),
        };
      });
    },
  });
}
