// Testes de lógica pura para src/lib/patientReportChart.ts — sem mocks, sem banco.
// Runner nativo do Node (node:test), mesmo padrão de tests/inbound.test.mjs.
//
// Rodar:  node --test tests/patientReportChart.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEvolutionChartGeometry,
  CHART_WIDTH,
  CHART_HEIGHT,
  CHART_PADDING,
} from "../src/lib/patientReportChart.ts";
import { REPORT_COLORS } from "../src/lib/patientReport.ts";

const CONFIG = { criticalityRedMax: 2.5, criticalityYellowMax: 3.5 };

test("plots day 1 at the left edge and the last program day at the right edge", () => {
  const g = buildEvolutionChartGeometry(
    [
      { day: 1, score: 3 },
      { day: 30, score: 3 },
    ],
    30,
    CONFIG,
  );
  assert.equal(g.dots[0].x, CHART_PADDING.left);
  assert.equal(g.dots[1].x, CHART_WIDTH - CHART_PADDING.right);
});

test("score 5 plots at the top of the plot area, score 1 at the bottom", () => {
  const g = buildEvolutionChartGeometry(
    [
      { day: 1, score: 5 },
      { day: 2, score: 1 },
    ],
    30,
    CONFIG,
  );
  assert.equal(g.dots[0].y, CHART_PADDING.top);
  assert.equal(g.dots[1].y, CHART_HEIGHT - CHART_PADDING.bottom);
});

test("produces three bands (red, yellow, green) ordered bottom-to-top and clamped to the [1,5] domain", () => {
  const g = buildEvolutionChartGeometry([], 30, CONFIG);
  assert.equal(g.bands.length, 3);
  assert.deepEqual(
    g.bands.map((b) => b.color),
    [REPORT_COLORS.red, REPORT_COLORS.yellow, REPORT_COLORS.green],
  );
});

test("breaks the line path into a new segment across a null score", () => {
  const g = buildEvolutionChartGeometry(
    [
      { day: 1, score: 3 },
      { day: 2, score: null },
      { day: 3, score: 4 },
    ],
    30,
    CONFIG,
  );
  const segments = g.linePath.trim().split("M").filter(Boolean);
  assert.equal(segments.length, 2); // one subpath for day 1, one for day 3 — day 2 is a gap
});

test("dots only include points with a non-null score", () => {
  const g = buildEvolutionChartGeometry(
    [
      { day: 1, score: 3 },
      { day: 2, score: null },
    ],
    30,
    CONFIG,
  );
  assert.equal(g.dots.length, 1);
});

test("breaks the line path across a real day gap, with no null point in between", () => {
  const g = buildEvolutionChartGeometry(
    [
      { day: 10, score: 3 },
      { day: 14, score: 4 },
    ],
    30,
    CONFIG,
  );
  const segments = g.linePath.trim().split("M").filter(Boolean);
  assert.equal(segments.length, 2); // days 11-13 were never answered — not a straight connector
});

test("does not break the line across consecutive answered days", () => {
  const g = buildEvolutionChartGeometry(
    [
      { day: 1, score: 3 },
      { day: 2, score: 3.5 },
      { day: 3, score: 4 },
    ],
    30,
    CONFIG,
  );
  const segments = g.linePath.trim().split("M").filter(Boolean);
  assert.equal(segments.length, 1);
});

test("empty points produce an empty line path and no dots", () => {
  const g = buildEvolutionChartGeometry([], 30, CONFIG);
  assert.equal(g.linePath, "");
  assert.deepEqual(g.dots, []);
});
