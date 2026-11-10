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

/** Brasília = UTC-3, sem horário de verão desde 2019. */
const BRT_OFFSET_HOURS = 3;

/**
 * Instante (ISO, UTC) da meia-noite de "hoje" no horário de Brasília. Deriva
 * de `brasiliaDateString` em vez de recalcular o "dia" por conta própria —
 * é a ÚNICA fonte de verdade do app pra "que dia é hoje em Brasília", usada
 * tanto pra exibir quanto pro corte do lembrete diário (api/cron/daily-form).
 */
export function brasiliaDayStartIso(input: Date = new Date()): string {
  const [year, month, day] = brasiliaDateString(input).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, BRT_OFFSET_HOURS)).toISOString();
}

/**
 * Parâmetros clínicos/de produto que eram constantes fixas e agora são
 * configuráveis por quem administra a clínica (tela Configurações >
 * Configuração Geral > Parâmetros clínicos), persistidos em
 * `app_settings`. Os valores aqui são só o fallback usado quando a
 * clínica ainda não configurou nada (coluna nula) — nunca o valor "de
 * verdade" em produção.
 */
export interface ClinicalConfig {
  /** Duração do programa de acompanhamento, em dias. */
  programLengthDays: number;
  /**
   * Até quantos dias (hoje incluso) o paciente pode preencher o diário
   * retroativamente, pra casos em que esqueceu de responder num dia anterior.
   * Usado tanto pra montar a lista de dias disponíveis (get-by-token) quanto
   * pra validar no servidor que o dia enviado (submit) está dentro da janela.
   */
  backfillDays: number;
  /** A partir de quantos dias sem resposta um paciente aparece no alerta do dashboard. */
  noResponseAlertDays: number;
  /** Média (últimas 3 respostas) abaixo disso = criticidade "red". */
  criticalityRedMax: number;
  /** Média (últimas 3 respostas) até isso (exclusive o red) = "yellow"; acima = "green". */
  criticalityYellowMax: number;
}

export const DEFAULT_CLINICAL_CONFIG: ClinicalConfig = {
  programLengthDays: 30,
  backfillDays: 7,
  noResponseAlertDays: 2,
  criticalityRedMax: 2.5,
  criticalityYellowMax: 3.5,
};

/**
 * Últimos `count` dias (yyyy-MM-dd, horário de Brasília), do mais antigo pro
 * mais recente, terminando em "hoje".
 */
export function recentBrasiliaDates(count: number, today: Date = new Date()): string[] {
  const [year, month, day] = brasiliaDateString(today).split("-").map(Number);
  const dates: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1, day - i));
    dates.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    );
  }
  return dates;
}

/**
 * Instante (ISO, UTC) de meio-dia de `dateStr` no horário de Brasília — usado
 * como `submitted_at` de uma resposta preenchida retroativamente (dia
 * diferente de hoje). Meio-dia em vez de meia-noite: cai dentro do MESMO dia
 * calendário tanto em UTC quanto em BRT, então bate certo com a constraint de
 * "uma resposta por paciente por dia" independente de em qual fuso ela conta
 * o dia — sem precisar inspecionar/alterar o schema do banco pra isso.
 */
export function brasiliaNoonIso(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12 + BRT_OFFSET_HOURS)).toISOString();
}

/**
 * Dia do programa (1..30) em `today`, contando o "hoje" no horário de
 * Brasília. parseISO interpreta "yyyy-MM-dd" como meia-noite LOCAL nos dois
 * lados da conta, então a diferença de dias não depende do fuso de quem roda
 * (navegador ou servidor da Vercel, que roda em UTC).
 */
export function programDay(
  startDate: string | null | undefined,
  today: Date = new Date(),
  programLengthDays: number = DEFAULT_CLINICAL_CONFIG.programLengthDays,
): number {
  if (!startDate) return 1;
  const start = parseISO(startDate);
  if (Number.isNaN(start.getTime())) return 1;
  const todayBrt = parseISO(brasiliaDateString(today));
  return Math.min(programLengthDays, Math.max(1, differenceInCalendarDays(todayBrt, start) + 1));
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
 *
 * Retorna `null` (não `0`) quando a entrada não tem nenhuma pergunta de
 * escala — "sem dado de escala" não é o mesmo que "nota mínima", e tratar os
 * dois igual gerava falso-positivo de criticidade vermelha pra quem respondeu
 * um formulário só com perguntas de texto.
 */
export function averageOfEntry(e: ResponseEntry): number | null {
  const scoreable = e.answers.filter(
    (a): a is typeof a & { value: number } => typeof a.value === "number" && a.isScale !== false,
  );
  if (!scoreable.length) return null;
  return scoreable.reduce((s, a) => s + a.value, 0) / scoreable.length;
}

export function criticalityFromResponses(
  responses: ResponseEntry[],
  config: Pick<
    ClinicalConfig,
    "criticalityRedMax" | "criticalityYellowMax"
  > = DEFAULT_CLINICAL_CONFIG,
): Criticality {
  if (!responses.length) return "unknown";
  const sorted = [...responses].sort((a, b) => b.date.localeCompare(a.date));
  const last3 = sorted.slice(0, 3);
  const scored = last3.map(averageOfEntry).filter((v): v is number => v !== null);
  if (!scored.length) return "unknown";
  const avg = scored.reduce((s, v) => s + v, 0) / scored.length;
  if (avg < config.criticalityRedMax) return "red";
  if (avg <= config.criticalityYellowMax) return "yellow";
  return "green";
}

export function daysSinceLastResponse(
  responses: ResponseEntry[],
  today: Date = new Date(),
): number | null {
  if (!responses.length) return null;
  const latest = [...responses].sort((a, b) => b.date.localeCompare(a.date))[0];
  return differenceInCalendarDays(parseISO(brasiliaDateString(today)), parseISO(latest.date));
}
