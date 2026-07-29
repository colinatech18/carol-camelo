import type { Criticality, ResponseEntry } from "@/types";
import { differenceInCalendarDays, parseISO } from "date-fns";

export function programDay(startDate: string, today: Date = new Date()): number {
  // parseISO interpreta "yyyy-MM-dd" como meia-noite LOCAL. `new Date(str)` a trataria
  // como meia-noite UTC, que em fusos negativos (ex.: UTC-3, Brasil) cai no dia anterior
  // — fazendo um paciente que começa hoje aparecer como "dia 2".
  return Math.min(30, Math.max(1, differenceInCalendarDays(today, parseISO(startDate)) + 1));
}

export function averageOfEntry(e: ResponseEntry): number {
  if (!e.answers.length) return 0;
  return e.answers.reduce((s, a) => s + a.value, 0) / e.answers.length;
}

export function criticalityFromResponses(responses: ResponseEntry[]): Criticality {
  if (!responses.length) return "unknown";
  const sorted = [...responses].sort((a, b) => b.date.localeCompare(a.date));
  const last3 = sorted.slice(0, 3);
  if (last3.length === 0) return "unknown";
  const avg = last3.reduce((s, r) => s + averageOfEntry(r), 0) / last3.length;
  if (avg < 2.5) return "red";
  if (avg <= 3.5) return "yellow";
  return "green";
}

export function daysSinceLastResponse(responses: ResponseEntry[], today: Date = new Date()): number | null {
  if (!responses.length) return null;
  const latest = [...responses].sort((a, b) => b.date.localeCompare(a.date))[0];
  return differenceInCalendarDays(today, parseISO(latest.date));
}
