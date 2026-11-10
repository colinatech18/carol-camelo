import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  brasiliaDateString,
  criticalityFromResponses,
  daysSinceLastResponse,
  programDay,
  DEFAULT_CLINICAL_CONFIG,
} from "@/lib/criticality";
import { useClinicalConfig } from "@/hooks/useClinicalConfig";
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
  const { data: config = DEFAULT_CLINICAL_CONFIG } = useClinicalConfig();

  const rawQuery = useQuery({
    queryKey: ["patients", "enriched-raw", includeArchived ? "all" : "active"],
    queryFn: async () => {
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

      return { patients: (patients ?? []) as any[], responses: (responses ?? []) as any[] };
    },
  });

  const data = useMemo((): EnrichedPatient[] | undefined => {
    if (!rawQuery.data) return undefined;
    const { patients, responses } = rawQuery.data;

    return patients.map((p) => {
      const resp: ResponseEntry[] = responses
        .filter((r) => r.patient_id === p.id)
        .map((r) => {
          const submitted = r.submitted_at ? new Date(r.submitted_at) : null;
          return {
            id: r.id,
            patientId: r.patient_id,
            // Dia da resposta no horário de Brasília (não UTC): quem responde
            // depois das 21h continua com a resposta no dia certo.
            date: submitted ? brasiliaDateString(submitted) : "",
            // Dia do programa NA DATA DA RESPOSTA — antes usava "hoje" e todas
            // as respostas apareciam como o mesmo dia.
            programDay: programDay(
              p.program_start_date,
              submitted ?? new Date(),
              config.programLengthDays,
            ),
            formId: r.form_id ?? undefined,
            // O jsonb já vem no formato { questionId, value, note?, isScale? }
            // gravado por api/forms/submit.ts — não precisa reshape aqui.
            answers: (r.responses ?? []) as ResponseEntry["answers"],
            createdAt: r.submitted_at ?? "",
          };
        });

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
        criticality: criticalityFromResponses(resp, config),
        daysSinceLast: daysSinceLastResponse(resp),
        programDay: programDay(patient.startDate, new Date(), config.programLengthDays),
        archivedAt: p.archived_at ?? null,
      };
    });
  }, [rawQuery.data, config]);

  return { ...rawQuery, data };
}
