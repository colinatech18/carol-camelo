import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { criticalityFromResponses, daysSinceLastResponse, programDay } from "@/lib/criticality";
import type { Patient, ResponseEntry } from "@/types";

export interface EnrichedPatient extends Patient {
  responses: ResponseEntry[];
  criticality: ReturnType<typeof criticalityFromResponses>;
  daysSinceLast: number | null;
  programDay: number;
  archivedAt: string | null;
}

/**
 * Por padrão, exclui pacientes arquivados (archived_at is not null) — mesmo
 * comportamento que todas as telas que já usam este hook (dashboard,
 * prontuários) tinham antes de o arquivamento existir. Passe
 * `includeArchived: true` explicitamente onde for preciso enxergar os
 * arquivados também (ex: tela de Pacientes, para alternar entre as duas
 * visões sem duas idas ao banco).
 */
export function useEnrichedPatients(opts: { includeArchived?: boolean } = {}) {
  const includeArchived = opts.includeArchived ?? false;

  return useQuery({
    queryKey: ["patients", "enriched", includeArchived ? "all" : "active"],
    queryFn: async (): Promise<EnrichedPatient[]> => {
      let query = supabase.from("patients").select("*").order("name");
      if (!includeArchived) {
        query = query.is("archived_at", null);
      }
      const { data: patients, error: pErr } = (await query) as any;
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
            formId: r.form_id ?? undefined,
            // O jsonb já vem no formato { questionId, value, note?, isScale? }
            // gravado por api/forms/submit.ts — não precisa reshape aqui.
            answers: (r.responses ?? []) as ResponseEntry["answers"],
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
          assignedFormId: p.assigned_form_id ?? undefined,
        };

        return {
          ...patient,
          responses: resp,
          criticality: criticalityFromResponses(resp),
          daysSinceLast: daysSinceLastResponse(resp),
          programDay: programDay(p.program_start_date),
          archivedAt: p.archived_at ?? null,
        };
      });
    },
  });
}