// Testes de lógica pura para src/lib/patientReport.ts — sem mocks, sem banco.
// Runner nativo do Node (node:test), mesmo padrão de tests/inbound.test.mjs.
//
// Rodar:  node --test tests/patientReport.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReportChartPoints,
  buildReportSummary,
  reportFileName,
  resolveReportLogoUrl,
} from "../src/lib/patientReport.ts";
import { DEFAULT_CLINICAL_CONFIG } from "../src/lib/criticality.ts";

const patient = { name: "Maria Silva", startDate: "2026-10-26" };

let idCounter = 0;
function mkResponse({ programDay, answers, createdAt = "2026-11-01T12:00:00.000Z" }) {
  idCounter += 1;
  return {
    id: `r${idCounter}`,
    patientId: "p1",
    date: "2026-11-01",
    programDay,
    answers,
    createdAt,
  };
}

test("sorts points ascending by day and maps averageOfEntry, rounded to 2 decimals", () => {
  const responses = [
    mkResponse({ programDay: 14, answers: [{ questionId: "q1", value: 4.666, isScale: true }] }),
    mkResponse({ programDay: 5, answers: [{ questionId: "q1", value: 2, isScale: true }] }),
  ];
  assert.deepEqual(buildReportChartPoints(responses), [
    { day: 5, score: 2 },
    { day: 14, score: 4.67 },
  ]);
});

test("keeps only the most recently created entry when several responses land on the same day (e.g. answers submitted after the program's last day all clamp to day 30)", () => {
  const responses = [
    mkResponse({
      programDay: 30,
      answers: [{ questionId: "q1", value: 2, isScale: true }],
      createdAt: "2026-11-01T12:00:00.000Z",
    }),
    mkResponse({
      programDay: 30,
      answers: [{ questionId: "q1", value: 4, isScale: true }],
      createdAt: "2026-11-02T12:00:00.000Z",
    }),
  ];
  assert.deepEqual(buildReportChartPoints(responses), [{ day: 30, score: 4 }]);
});

test("entries with no scale answers map to score: null", () => {
  const responses = [
    mkResponse({ programDay: 3, answers: [{ questionId: "q1", value: "texto", isScale: false }] }),
  ];
  assert.deepEqual(buildReportChartPoints(responses), [{ day: 3, score: null }]);
});

test("hasScorableData is false when there are no responses", () => {
  const summary = buildReportSummary(patient, [], DEFAULT_CLINICAL_CONFIG, new Date("2026-11-25"));
  assert.equal(summary.hasScorableData, false);
});

test("hasScorableData is false when every response has only non-scale answers", () => {
  const responses = [
    mkResponse({ programDay: 1, answers: [{ questionId: "q1", value: "x", isScale: false }] }),
  ];
  const summary = buildReportSummary(
    patient,
    responses,
    DEFAULT_CLINICAL_CONFIG,
    new Date("2026-11-25"),
  );
  assert.equal(summary.hasScorableData, false);
});

test("isPartial is true before program completion, false at/after it", () => {
  const patientStartedToday = { ...patient, startDate: "2026-11-25" };
  const early = buildReportSummary(
    patientStartedToday,
    [],
    DEFAULT_CLINICAL_CONFIG,
    new Date("2026-11-25"),
  );
  assert.equal(early.isPartial, true);
  const patientStarted30DaysAgo = { ...patient, startDate: "2026-10-26" };
  const done = buildReportSummary(
    patientStarted30DaysAgo,
    [],
    DEFAULT_CLINICAL_CONFIG,
    new Date("2026-11-25"),
  );
  assert.equal(done.isPartial, false);
});

test("slugifies accented names and appends the Brasília date", () => {
  assert.equal(
    reportFileName("José da Conceição", new Date("2026-11-25T10:00:00-03:00")),
    "relatorio-jose-da-conceicao-2026-11-25.pdf",
  );
});

test("falls back to a generic slug when the name has no alphanumeric characters", () => {
  assert.equal(
    reportFileName("...", new Date("2026-11-25T10:00:00-03:00")),
    "relatorio-paciente-2026-11-25.pdf",
  );
});

test("resolveReportLogoUrl passes through formats react-pdf can render", () => {
  assert.equal(resolveReportLogoUrl("https://x.test/logo.png"), "https://x.test/logo.png");
  assert.equal(resolveReportLogoUrl("https://x.test/logo.JPG"), "https://x.test/logo.JPG");
  assert.equal(resolveReportLogoUrl("https://x.test/logo.svg"), "https://x.test/logo.svg");
});

test("resolveReportLogoUrl drops formats react-pdf can't render (e.g. webp) so the text fallback shows", () => {
  assert.equal(resolveReportLogoUrl("https://x.test/logo.webp"), null);
});

test("resolveReportLogoUrl passes null through as null", () => {
  assert.equal(resolveReportLogoUrl(null), null);
});
