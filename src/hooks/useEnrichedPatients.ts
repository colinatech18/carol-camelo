import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
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
      const { data: patients, error: pErr } = (await supabase
        .from("patients")
        .select("*")
        .order("name")) as any;
      if (pErr) throw pErr;

      const { data: responses, error: rErr } = (await supabase
        .from("form_responses")
        .select("*")) as any;
      if (rErr) throw rErr;

      return (patients ?? []).map((p: any) => {
        const resp: ResponseEntry[] = (responses ?? [])
          .filter((r: any) => r.patient_id === p.id)
          .map((r: any) => ({
            id: r.id,
            patientId: r.patient_id,
            date: r.submitted_at?.slice(0, 10) ?? "",
            programDay: programDay(p.program_start_date),
            answers: r.responses ?? [],
            createdAt: r.submitted_at ?? "",
          }));

        const patient: Patient = {
          id: p.id,
          name: p.name,
          email: p.email ?? "",
          whatsapp: p.phone ?? "",
          startDate: p.program_start_date ?? "",
          responsibleId: p.responsible_id ?? "",
          status: p.status ?? "active",
          publicToken: p.public_token ?? "",
        };

        return {
          ...patient,
          responses: resp,
          criticality: criticalityFromResponses(resp),
          daysSinceLast: daysSinceLastResponse(resp),
          programDay: programDay(p.program_start_date),
        };
      });
    },
  });
}
