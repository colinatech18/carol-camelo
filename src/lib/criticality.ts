import type { Criticality, ResponseEntry } from "@/types";
import { differenceInCalendarDays, parseISO } from "date-fns";

/**
 * Fuso de referência do app: horário de Brasília. Todo "dia" do sistema
 * (dia da resposta, dia do programa, "respondeu hoje") é contado nesse fuso,
 * e não em UTC — que fica 3h na frente e fazia o dia virar às 21h.
 */
export const APP_TIMEZONE = "America/Sao_Paulo";

/** Data (yyyy-MM-dd) do instante informado, no horário de Brasília. */
export function brasiliaDateString(input: Date | string | number = new Date()): string {
  const d = input instanceof Date ? input : new Date(input);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Dia do programa (1..30) em `today`, contando o "hoje" no horário de
 * Brasília. parseISO interpreta "yyyy-MM-dd" como meia-noite LOCAL nos dois
 * lados da conta, então a diferença de dias não depende do fuso de quem roda
 * (navegador ou servidor da Vercel, que roda em UTC).
 */
export function programDay(startDate: string, today: Date = new Date()): number {
  const todayBrt = parseISO(brasiliaDateString(today));
  return Math.min(30, Math.max(1, differenceInCalendarDays(todayBrt, parseISO(startDate)) + 1));
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
  return differenceInCalendarDays(parseISO(brasiliaDateString(today)), parseISO(latest.date));
}