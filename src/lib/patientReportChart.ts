import type { ClinicalConfig } from "./criticality.ts";
import { REPORT_COLORS, type ReportChartPoint } from "./patientReport.ts";

export const CHART_WIDTH = 480;
export const CHART_HEIGHT = 220;
export const CHART_PADDING = { top: 10, right: 10, bottom: 24, left: 28 };
export const CHART_Y_DOMAIN: [number, number] = [1, 5];

export interface EvolutionChartGeometry {
  width: number;
  height: number;
  bands: Array<{ y: number; height: number; color: string }>;
  linePath: string;
  dots: Array<{ x: number; y: number }>;
  xAxisTicks: Array<{ x: number; label: string }>;
  yAxisTicks: Array<{ y: number; label: string }>;
}

const PLOT_WIDTH = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
const PLOT_HEIGHT = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scaleY(score: number): number {
  const clamped = clamp(score, CHART_Y_DOMAIN[0], CHART_Y_DOMAIN[1]);
  return (
    CHART_PADDING.top +
    (1 - (clamped - CHART_Y_DOMAIN[0]) / (CHART_Y_DOMAIN[1] - CHART_Y_DOMAIN[0])) * PLOT_HEIGHT
  );
}

function scaleX(day: number, programLengthDays: number): number {
  return CHART_PADDING.left + ((day - 1) / Math.max(1, programLengthDays - 1)) * PLOT_WIDTH;
}

export function buildEvolutionChartGeometry(
  points: ReportChartPoint[],
  programLengthDays: number,
  config: Pick<ClinicalConfig, "criticalityRedMax" | "criticalityYellowMax">,
): EvolutionChartGeometry {
  const bandBounds: Array<[number, number, string]> = [
    [CHART_Y_DOMAIN[0], config.criticalityRedMax, REPORT_COLORS.red],
    [config.criticalityRedMax, config.criticalityYellowMax, REPORT_COLORS.yellow],
    [config.criticalityYellowMax, CHART_Y_DOMAIN[1], REPORT_COLORS.green],
  ];
  const bands = bandBounds.map(([lower, upper, color]) => {
    const clampedLower = clamp(lower, CHART_Y_DOMAIN[0], CHART_Y_DOMAIN[1]);
    const clampedUpper = clamp(upper, CHART_Y_DOMAIN[0], CHART_Y_DOMAIN[1]);
    return { y: scaleY(clampedUpper), height: scaleY(clampedLower) - scaleY(clampedUpper), color };
  });

  const scaledPoints = points.map((p) => ({
    day: p.day,
    score: p.score,
    x: scaleX(p.day, programLengthDays),
    y: p.score === null ? null : scaleY(p.score),
  }));

  const dots = scaledPoints
    .filter((p): p is typeof p & { y: number } => p.y !== null)
    .map((p) => ({ x: p.x, y: p.y }));

  const runs: Array<Array<{ x: number; y: number }>> = [];
  let currentRun: Array<{ x: number; y: number }> = [];
  let lastDay: number | null = null;
  for (const p of scaledPoints) {
    if (p.y === null) {
      if (currentRun.length) runs.push(currentRun);
      currentRun = [];
      lastDay = null;
      continue;
    }
    // Um dia sem resposta nenhuma (não um score null, um dia ausente de `points`)
    // também quebra a linha — não dá pra assumir dado entre dois dias respondidos
    // que não são consecutivos.
    if (lastDay !== null && p.day - lastDay > 1) {
      if (currentRun.length) runs.push(currentRun);
      currentRun = [];
    }
    currentRun.push({ x: p.x, y: p.y });
    lastDay = p.day;
  }
  if (currentRun.length) runs.push(currentRun);

  const linePath = runs
    .map((run) => run.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" "))
    .join(" ");

  const yAxisTicks = [1, 2, 3, 4, 5].map((v) => ({ y: scaleY(v), label: String(v) }));
  const xTickDays = Array.from(
    new Set([
      1,
      ...Array.from({ length: Math.floor(programLengthDays / 5) }, (_, i) => (i + 1) * 5),
      programLengthDays,
    ]),
  ).sort((a, b) => a - b);
  const xAxisTicks = xTickDays.map((day) => ({
    x: scaleX(day, programLengthDays),
    label: String(day),
  }));

  return {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    bands,
    linePath,
    dots,
    xAxisTicks,
    yAxisTicks,
  };
}
