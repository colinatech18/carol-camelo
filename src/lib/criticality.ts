import type { Criticality, ResponseEntry } from "@/types";
import { differenceInCalendarDays, parseISO } from "date-fns";

export function programDay(startDate: string, today: Date = new Date()): number {
  // parseISO interpreta "yyyy-MM-dd" como meia-noite LOCAL. `new Date(str)` a trataria
  // como meia-noite UTC, que em fusos negativos (ex.: UTC-3, Brasil) cai no dia anterior
  // — fazendo um paciente que começa hoje aparecer como "dia 2".
  return Math.min(30, Math.max(1, differenceInCalendarDays(today, parseISO(startDate)) + 1));
}

/**
 * Média das respostas de campo tipo ESCALA de uma entrada (scale/emoji_scale —
 * marcadas com `isScale`). Deliberadamente ignora outros campos numéricos (ex.:
 * um campo "Peso (kg)" cadastrado num formulário dinâmico) para não distorcer o
 * índice de criticidade, que assume uma escala 1–5 de bem-estar.
 *
 * `isScale` ausente é tratado como true: preserva o comportamento de respostas
 * gravadas antes da migração para formulários dinâmicos, quando só existiam
 * perguntas de escala.
 */
export function averageOfEntry(e: ResponseEntry): number {
  const scoreable = e.answers.filter(
    (a): a is typeof a & { value: number } => typeof a.value === "number" && a.isScale !== false,
  );
  if (!scoreable.length) return 0;
  return scoreable.reduce((s, a) => s + a.value, 0) / scoreable.length;
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