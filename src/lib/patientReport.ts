import type { Criticality, Patient, ResponseEntry } from "../types.ts";
import {
  type ClinicalConfig,
  averageOfEntry,
  brasiliaDateString,
  criticalityFromResponses,
  programDay,
} from "./criticality.ts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export const REPORT_COLORS = {
  primary: "#7E9C90",
  red: "#ef4444",
  yellow: "#eab308",
  green: "#22c55e",
} as const;

export interface ReportChartPoint {
  day: number;
  score: number | null;
}

export interface ReportSummary {
  patientName: string;
  startDateLabel: string;
  currentDay: number;
  programLengthDays: number;
  criticality: Criticality;
  isPartial: boolean;
  hasScorableData: boolean;
}

export function buildReportChartPoints(responses: ResponseEntry[]): ReportChartPoint[] {
  // Mais de uma resposta pode cair no mesmo programDay — ex. respostas enviadas
  // depois do fim do programa, que `programDay()` trava no último dia. Mantém só
  // a mais recente por dia, senão o traçado empilha pontos no mesmo x.
  const latestByDay = new Map<number, ResponseEntry>();
  for (const r of responses) {
    const existing = latestByDay.get(r.programDay);
    if (!existing || r.createdAt > existing.createdAt) {
      latestByDay.set(r.programDay, r);
    }
  }
  return Array.from(latestByDay.values())
    .map((r) => {
      const avg = averageOfEntry(r);
      return { day: r.programDay, score: avg === null ? null : Math.round(avg * 100) / 100 };
    })
    .sort((a, b) => a.day - b.day);
}

export function buildReportSummary(
  patient: Pick<Patient, "name" | "startDate">,
  responses: ResponseEntry[],
  clinicalConfig: ClinicalConfig,
  today: Date = new Date(),
): ReportSummary {
  const currentDay = programDay(patient.startDate, today, clinicalConfig.programLengthDays);
  return {
    patientName: patient.name,
    startDateLabel: patient.startDate
      ? format(parseISO(patient.startDate), "dd MMM yyyy", { locale: ptBR })
      : "—",
    currentDay,
    programLengthDays: clinicalConfig.programLengthDays,
    criticality: criticalityFromResponses(responses, clinicalConfig),
    isPartial: currentDay < clinicalConfig.programLengthDays,
    hasScorableData: responses.some((r) => averageOfEntry(r) !== null),
  };
}

// @react-pdf/image (4.9.0) só sabe decodificar png, jpg/jpeg e svg. Um logo
// webp (aceito no upload de marca, ver clinicBranding.ts) falha ao buscar e o
// erro é só um console.warn interno — o cabeçalho do PDF fica em branco sem
// aviso nenhum. Melhor cair no texto "Vera PSI" de propósito do que arriscar
// isso num documento que sai da clínica.
const REPORT_LOGO_EXTENSIONS = [".png", ".jpg", ".jpeg", ".svg"];

export function resolveReportLogoUrl(logoUrl: string | null): string | null {
  if (!logoUrl) return null;
  const path = logoUrl.split(/[?#]/)[0].toLowerCase();
  return REPORT_LOGO_EXTENSIONS.some((ext) => path.endsWith(ext)) ? logoUrl : null;
}

export function reportFileName(patientName: string, generatedAt: Date = new Date()): string {
  const slug =
    patientName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "paciente";
  return `relatorio-${slug}-${brasiliaDateString(generatedAt)}.pdf`;
}
