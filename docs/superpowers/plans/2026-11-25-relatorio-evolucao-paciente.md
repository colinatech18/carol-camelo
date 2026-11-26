# Relatório de evolução do paciente (PDF) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Emitir relatório" button to the patient detail page that generates a downloadable PDF with the patient's identification, program period summary, and 30-day evolution chart (with red/yellow/green zones), for the clinical team to send manually to the client.

**Architecture:** All report logic is split into pure, unit-testable functions (`src/lib/patientReport.ts` for summary/filename, `src/lib/patientReportChart.ts` for chart geometry) consumed by thin `@react-pdf/renderer` presentational components (`EvolutionChartPdf.tsx`, `PatientReportDocument.tsx`), triggered from a new button/mutation in `_app.pacientes.$id.tsx`. `@react-pdf/renderer` is only ever reached via dynamic `import()` from inside the button's click handler, so it never enters the server/edge (Cloudflare Workers) SSR bundle.

**Tech Stack:** React 19, TanStack Start/Router, TanStack Query, `@react-pdf/renderer` (new dependency), `date-fns` + `ptBR`, existing `src/lib/criticality.ts` data model. Tests use Node's built-in `node:test` runner (project convention — see `tests/inbound.test.mjs`), no new test framework.

**Spec:** [docs/superpowers/specs/2026-11-25-relatorio-evolucao-paciente-design.md](../specs/2026-11-25-relatorio-evolucao-paciente-design.md)

## Global Constraints

- Report content is exactly: clinic letterhead (logo or "Vera PSI" fallback text), patient name + program start date, "Dia X de {programLengthDays}" + criticality, evolution chart. No prontuário excerpts, no appointments list, no automated sending.
- "Emitir relatório" is always visible/enabled on the patient page, never gated on program completion.
- Never hardcode `30`, `2.5`, or `3.5` for program length / criticality thresholds — always read them from the `ClinicalConfig` passed in (mirrors `DEFAULT_CLINICAL_CONFIG` in `src/lib/criticality.ts`, which is itself only a fallback).
- Chart Y domain is fixed `[1, 5]`, matching the existing on-screen charts.
- Band/line colors are static hex (react-pdf cannot read CSS vars or `oklch()`, and the report must look the same regardless of the viewer's light/dark theme): red `#ef4444`, yellow `#eab308`, green `#22c55e` (same literals already used for the dashboard's `ReferenceArea` bands in `_app.dashboard.tsx`), line/primary `#7E9C90` (static light-mode value of `--primary`, per the comment in `src/styles.css:64`).
- `@react-pdf/renderer` and any module that imports it (`PatientReportDocument.tsx`, `EvolutionChartPdf.tsx`) must only be reached via dynamic `import()` at the call site in the route — never imported at the top of `_app.pacientes.$id.tsx` or any other module that's part of the route's eagerly-loaded (SSR) bundle.
- All day/date logic reuses the existing Brasília-timezone helpers (`programDay`, `brasiliaDateString`) and `averageOfEntry`/`criticalityFromResponses` from `src/lib/criticality.ts` — no new date math, no new criticality math.
- pt-BR copy throughout; dates formatted with `date-fns` + `ptBR` locale, consistent with the rest of the app (e.g. `format(parseISO(date), "dd MMM yyyy", { locale: ptBR })`).
- Filename pattern: `relatorio-{slug-do-nome}-{yyyy-MM-dd}.pdf`.
- Partial-report label shown only when `currentDay < programLengthDays`.
- Empty-state message `"Sem dados suficientes para gerar o gráfico de evolução."` whenever there is no scoreable data (`responses` empty, or every entry's `averageOfEntry` is `null`) — never render an empty/broken chart.
- Patient identification block is name + program start date only — no email, phone, or responsible clinician (deliberately minimized for a document that leaves the clinic).
- Use `@react-pdf/renderer`'s built-in default font (Helvetica) — no custom font registration in this version.
- Note on tooling mismatch: `CLAUDE.md` describes Bun (`bun.lock`, `bunfig.toml` with a 24h `minimumReleaseAge` guard), but the working tree has neither file — only `package-lock.json`. Use `npm install` for the new dependency. As a stand-in for the missing automated guard, manually confirm the resolved `@react-pdf/renderer` version is not from the last 24h before committing (e.g. `npm view @react-pdf/renderer time --json`); if it is, pin the previous version explicitly.

## Review Focus

- Patient with zero responses recorded: report must show the "sem dados suficientes" empty-state, not a blank or erroring chart. (Task 1)
- Patient whose responses all have only non-scale answers (`isScale: false` or no numeric values), so `responses.length > 0` but every `averageOfEntry` is `null`: must still trigger the empty-state, not a false "red" criticality or an empty chart. (Task 1)
- Responses arriving out of order or with a backfilled entry whose `programDay` is lower than an earlier-submitted one: chart points must end up sorted ascending by `day` so the line doesn't zigzag backward. (Task 1)
- A gap between answered days (e.g. day 10 then day 14, nothing between): the line must break across the gap rather than being drawn as a straight connector that implies interpolated data for the unanswered days. (Task 2)
- Patient name with accents/diacritics or symbols (e.g. "José da Conceição"): `reportFileName` must produce a safe, accent-free filename instead of leaving characters that could break the download or `Content-Disposition` handling. (Task 1)

---

### Task 1: Report summary & filename helpers

**Files:**
- Create: `src/lib/patientReport.ts`
- Test: `tests/patientReport.test.mjs`

**Interfaces:**
- Consumes: `ResponseEntry`, `Patient`, `Criticality` from `@/types`; `ClinicalConfig`, `programDay`, `averageOfEntry`, `criticalityFromResponses`, `brasiliaDateString` from `@/lib/criticality`.
- Produces (consumed by Tasks 2, 3, 4, 5):
  - `export const REPORT_COLORS: { primary: string; red: string; yellow: string; green: string }`
  - `export interface ReportChartPoint { day: number; score: number | null }`
  - `export interface ReportSummary { patientName: string; startDateLabel: string; currentDay: number; programLengthDays: number; criticality: Criticality; isPartial: boolean; hasScorableData: boolean }`
  - `export function buildReportChartPoints(responses: ResponseEntry[]): ReportChartPoint[]`
  - `export function buildReportSummary(patient: Pick<Patient, "name" | "startDate">, responses: ResponseEntry[], clinicalConfig: ClinicalConfig, today?: Date): ReportSummary`
  - `export function reportFileName(patientName: string, generatedAt?: Date): string`

- [ ] **Step 1: Write failing tests for `buildReportChartPoints`**

```js
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

test("entries with no scale answers map to score: null", () => {
  const responses = [mkResponse({ programDay: 3, answers: [{ questionId: "q1", value: "texto", isScale: false }] })];
  assert.deepEqual(buildReportChartPoints(responses), [{ day: 3, score: null }]);
});
```

(`mkResponse` is a small local test helper building a minimal `ResponseEntry`; add it at the top of the test file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/patientReport.test.mjs`
Expected: FAIL with "buildReportChartPoints is not a function" (or module not found).

- [ ] **Step 3: Implement `buildReportChartPoints` in `src/lib/patientReport.ts`**

Map each response to `{ day: r.programDay, score }` where `score` is `averageOfEntry(r)` rounded to 2 decimals (`null` stays `null`), then sort the resulting array ascending by `day` (stable sort; don't dedupe same-day entries).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/patientReport.test.mjs`
Expected: PASS

- [ ] **Step 5: Write failing tests for `buildReportSummary`**

```js
test("hasScorableData is false when there are no responses", () => {
  const summary = buildReportSummary(patient, [], DEFAULT_CLINICAL_CONFIG, new Date("2026-11-25"));
  assert.equal(summary.hasScorableData, false);
});

test("hasScorableData is false when every response has only non-scale answers", () => {
  const responses = [mkResponse({ programDay: 1, answers: [{ questionId: "q1", value: "x", isScale: false }] })];
  const summary = buildReportSummary(patient, responses, DEFAULT_CLINICAL_CONFIG, new Date("2026-11-25"));
  assert.equal(summary.hasScorableData, false);
});

test("isPartial is true before program completion, false at/after it", () => {
  const patientStartedToday = { ...patient, startDate: "2026-11-25" };
  const early = buildReportSummary(patientStartedToday, [], DEFAULT_CLINICAL_CONFIG, new Date("2026-11-25"));
  assert.equal(early.isPartial, true);
  const patientStarted30DaysAgo = { ...patient, startDate: "2026-10-26" };
  const done = buildReportSummary(patientStarted30DaysAgo, [], DEFAULT_CLINICAL_CONFIG, new Date("2026-11-25"));
  assert.equal(done.isPartial, false);
});
```

Import `DEFAULT_CLINICAL_CONFIG` from `@/lib/criticality` (relative path in the test, e.g. `../src/lib/criticality.ts`) and a minimal `patient = { name: "Maria Silva", startDate: "2026-10-26" }`.

- [ ] **Step 6: Run test to verify it fails, then implement `buildReportSummary`**

`currentDay = programDay(patient.startDate, today, clinicalConfig.programLengthDays)`; `criticality = criticalityFromResponses(responses, clinicalConfig)`; `isPartial = currentDay < clinicalConfig.programLengthDays`; `hasScorableData = responses.some(r => averageOfEntry(r) !== null)`; `startDateLabel` is `"—"` when `patient.startDate` is falsy, otherwise `format(parseISO(patient.startDate), "dd MMM yyyy", { locale: ptBR })`.

Run: `node --test tests/patientReport.test.mjs` — expect PASS after implementing.

- [ ] **Step 7: Write failing tests for `reportFileName`**

```js
test("slugifies accented names and appends the Brasília date", () => {
  assert.equal(
    reportFileName("José da Conceição", new Date("2026-11-25T10:00:00-03:00")),
    "relatorio-jose-da-conceicao-2026-11-25.pdf",
  );
});

test("falls back to a generic slug when the name has no alphanumeric characters", () => {
  assert.equal(reportFileName("...", new Date("2026-11-25T10:00:00-03:00")), "relatorio-paciente-2026-11-25.pdf");
});
```

- [ ] **Step 8: Run test to verify it fails, then implement `reportFileName`**

Normalize with `.normalize("NFD").replace(/[̀-ͯ]/g, "")`, lowercase, replace runs of non-alphanumeric characters with `-`, trim leading/trailing `-`; if the result is empty use `"paciente"`. Use `brasiliaDateString(generatedAt)` for the date segment (defaults to `new Date()`).

Run: `node --test tests/patientReport.test.mjs`
Expected: all tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/patientReport.ts tests/patientReport.test.mjs
git commit -m "feat: add patient report summary and filename helpers"
```

---

### Task 2: Evolution chart geometry (pure)

**Files:**
- Create: `src/lib/patientReportChart.ts`
- Test: `tests/patientReportChart.test.mjs`

**Interfaces:**
- Consumes: `ReportChartPoint` from `@/lib/patientReport` (Task 1); `ClinicalConfig` from `@/lib/criticality`.
- Produces (consumed by Task 3):
  - `export const CHART_WIDTH = 480`
  - `export const CHART_HEIGHT = 220`
  - `export const CHART_PADDING = { top: 10, right: 10, bottom: 24, left: 28 }`
  - `export const CHART_Y_DOMAIN: [number, number] = [1, 5]`
  - `export interface EvolutionChartGeometry { width: number; height: number; bands: Array<{ y: number; height: number; color: string }>; linePath: string; dots: Array<{ x: number; y: number }>; xAxisTicks: Array<{ x: number; label: string }>; yAxisTicks: Array<{ y: number; label: string }> }`
  - `export function buildEvolutionChartGeometry(points: ReportChartPoint[], programLengthDays: number, config: Pick<ClinicalConfig, "criticalityRedMax" | "criticalityYellowMax">): EvolutionChartGeometry`

- [ ] **Step 1: Write failing tests for the coordinate scales and bands**

```js
test("plots day 1 at the left edge and the last program day at the right edge", () => {
  const g = buildEvolutionChartGeometry(
    [{ day: 1, score: 3 }, { day: 30, score: 3 }],
    30,
    { criticalityRedMax: 2.5, criticalityYellowMax: 3.5 },
  );
  assert.equal(g.dots[0].x, CHART_PADDING.left);
  assert.equal(g.dots[1].x, CHART_WIDTH - CHART_PADDING.right);
});

test("score 5 plots at the top of the plot area, score 1 at the bottom", () => {
  const g = buildEvolutionChartGeometry([{ day: 1, score: 5 }, { day: 2, score: 1 }], 30, {
    criticalityRedMax: 2.5,
    criticalityYellowMax: 3.5,
  });
  assert.equal(g.dots[0].y, CHART_PADDING.top);
  assert.equal(g.dots[1].y, CHART_HEIGHT - CHART_PADDING.bottom);
});

test("produces three bands (red, yellow, green) ordered bottom-to-top and clamped to the [1,5] domain", () => {
  const g = buildEvolutionChartGeometry([], 30, { criticalityRedMax: 2.5, criticalityYellowMax: 3.5 });
  assert.equal(g.bands.length, 3);
  assert.deepEqual(g.bands.map((b) => b.color), [REPORT_COLORS.red, REPORT_COLORS.yellow, REPORT_COLORS.green]);
});
```

Import `REPORT_COLORS` and `CHART_PADDING`/`CHART_WIDTH`/`CHART_HEIGHT` from the respective modules in the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/patientReportChart.test.mjs`
Expected: FAIL (module/function not found)

- [ ] **Step 3: Implement the scales and band geometry in `src/lib/patientReportChart.ts`**

Plot area is `CHART_WIDTH/HEIGHT` minus `CHART_PADDING`. `scaleX(day) = left + (day - 1) / max(1, programLengthDays - 1) * plotWidth`. `scaleY(score) = top + (1 - (clamp(score, 1, 5) - 1) / 4) * plotHeight`. Bands cover `[1, criticalityRedMax]` (red), `[criticalityRedMax, criticalityYellowMax]` (yellow), `[criticalityYellowMax, 5]` (green), each clamped into `[1, 5]` before scaling, expressed as `{ y: scaleY(upperBound), height: scaleY(lowerBound) - scaleY(upperBound), color }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/patientReportChart.test.mjs`
Expected: PASS for the scale/band tests

- [ ] **Step 5: Write failing tests for the line path gap behavior**

```js
test("breaks the line path into a new segment across a null score", () => {
  const g = buildEvolutionChartGeometry(
    [{ day: 1, score: 3 }, { day: 2, score: null }, { day: 3, score: 4 }],
    30,
    { criticalityRedMax: 2.5, criticalityYellowMax: 3.5 },
  );
  const segments = g.linePath.trim().split("M").filter(Boolean);
  assert.equal(segments.length, 2); // one subpath for day 1, one for day 3 — day 2 is a gap
});

test("dots only include points with a non-null score", () => {
  const g = buildEvolutionChartGeometry([{ day: 1, score: 3 }, { day: 2, score: null }], 30, {
    criticalityRedMax: 2.5,
    criticalityYellowMax: 3.5,
  });
  assert.equal(g.dots.length, 1);
});

test("empty points produce an empty line path and no dots", () => {
  const g = buildEvolutionChartGeometry([], 30, { criticalityRedMax: 2.5, criticalityYellowMax: 3.5 });
  assert.equal(g.linePath, "");
  assert.deepEqual(g.dots, []);
});
```

- [ ] **Step 6: Run test to verify it fails, then implement the line path + dots**

Group consecutive non-null points into runs; for each run emit `M x0 y0 L x1 y1 L x2 y2 ...`, join runs with a space. `dots` is the flat list of `{x, y}` for every non-null point (same scales as the line).

Run: `node --test tests/patientReportChart.test.mjs`
Expected: all tests PASS

- [ ] **Step 7: Implement `xAxisTicks`/`yAxisTicks` (no dedicated test — fixed, low-risk formatting)**

`yAxisTicks`: `[1,2,3,4,5].map(v => ({ y: scaleY(v), label: String(v) }))`. `xAxisTicks`: build from `[1, 5, 10, 15, 20, 25, 30-ish]` — concretely: `{1, ...multiples of 5 up to programLengthDays, programLengthDays}` deduplicated and sorted, each mapped to `{ x: scaleX(day), label: String(day) }`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/patientReportChart.ts tests/patientReportChart.test.mjs
git commit -m "feat: add pure evolution chart geometry for patient report"
```

---

### Task 3: PDF chart component

**Files:**
- Create: `src/components/EvolutionChartPdf.tsx`

**Interfaces:**
- Consumes: `EvolutionChartGeometry` from `@/lib/patientReportChart` (Task 2); `REPORT_COLORS` from `@/lib/patientReport` (Task 1); `Svg`, `Path`, `Rect`, `Circle`, `Text` from `@react-pdf/renderer`.
- Produces (consumed by Task 4): `export function EvolutionChartPdf({ geometry }: { geometry: EvolutionChartGeometry }): JSX.Element`

No automated test for this task — it's a thin `@react-pdf/renderer` presentational component with no DOM/PDF rendering harness in this project (see Global Constraints). It's verified visually as part of Task 5's manual check.

- [ ] **Step 1: Implement `EvolutionChartPdf` in `src/components/EvolutionChartPdf.tsx`**

Render an `<Svg width={geometry.width} height={geometry.height}>` containing, in order: one `<Rect>` per `geometry.bands` entry (`x={CHART_PADDING.left}`, `width` spanning the plot area, `fill={color + "20"}` for ~12% opacity, matching the dashboard's `ReferenceArea` fill convention, no stroke); one `<Path d={geometry.linePath} stroke={REPORT_COLORS.primary} strokeWidth={1.5} fill="none" />`; one `<Circle r={2} fill={REPORT_COLORS.primary} />` per entry in `geometry.dots`; one `<Text>` per `geometry.yAxisTicks` (positioned at `x=0`, `y=tick.y`, font size ~8) and per `geometry.xAxisTicks` (positioned at `x=tick.x`, `y=geometry.height`, font size ~8). When `geometry.linePath` is `""` (no data), render just the bands/axes with no line/dots — this case is normally avoided by the caller (Task 4 only renders this component when `hasScorableData` is true), but the component itself shouldn't crash on it.

- [ ] **Step 2: Commit**

```bash
git add src/components/EvolutionChartPdf.tsx
git commit -m "feat: add PDF evolution chart component"
```

---

### Task 4: PDF document component

**Files:**
- Create: `src/components/PatientReportDocument.tsx`

**Interfaces:**
- Consumes: `ReportSummary`, `REPORT_COLORS` from `@/lib/patientReport` (Task 1); `EvolutionChartGeometry` from `@/lib/patientReportChart` (Task 2); `EvolutionChartPdf` from `@/components/EvolutionChartPdf` (Task 3); `Document`, `Page`, `View`, `Text`, `Image`, `StyleSheet` from `@react-pdf/renderer`.
- Produces (consumed by Task 5): `export function PatientReportDocument({ clinicLogoUrl, summary, geometry }: { clinicLogoUrl: string | null; summary: ReportSummary; geometry: EvolutionChartGeometry | null }): JSX.Element`

No automated test (same reasoning as Task 3) — verified in Task 5.

- [ ] **Step 1: Implement `PatientReportDocument` in `src/components/PatientReportDocument.tsx`**

`<Document><Page size="A4" style={{ padding: 40 }}>`, containing:
- Header: `<Image src={clinicLogoUrl} style={{ height: 32 }} />` when `clinicLogoUrl` is set, else `<Text style={{ fontSize: 16, fontWeight: 700 }}>Vera PSI</Text>`.
- Patient block: `<Text style={{ fontSize: 14, fontWeight: 700, marginTop: 16 }}>{summary.patientName}</Text>`, `<Text>Início do programa: {summary.startDateLabel}</Text>`.
- Period summary: `<Text>Dia {summary.currentDay} de {summary.programLengthDays}</Text>`, a criticality line using the same label text as `CriticalityBadge` (`Crítico`/red, `Atenção`/yellow, `Estável`/green, `Sem dados`/muted — reuse the `REPORT_COLORS` red/yellow/green for the text color, `"#6b7280"` for `unknown`) colored with the matching `REPORT_COLORS` value, and — only when `summary.isPartial` — a `<Text style={{ fontSize: 9, color: "#6b7280" }}>Relatório parcial — programa em andamento.</Text>`.
- Chart section: when `geometry` is `null`, `<Text>Sem dados suficientes para gerar o gráfico de evolução.</Text>`; otherwise `<EvolutionChartPdf geometry={geometry} />`.
- Footer: `<Text style={{ fontSize: 8, color: "#9ca3af", marginTop: 24 }}>Gerado em {formatted current date/time} pela Vera PSI</Text>` (format with `date-fns` + `ptBR`, consistent with the rest of the app).

- [ ] **Step 2: Commit**

```bash
git add src/components/PatientReportDocument.tsx
git commit -m "feat: add patient report PDF document"
```

---

### Task 5: Wire up the "Emitir relatório" button

**Files:**
- Modify: `src/routes/_app.pacientes.$id.tsx` (around the existing action buttons, `src/routes/_app.pacientes.$id.tsx:572-590`)
- Modify: `package.json` (new dependency)

**Interfaces:**
- Consumes: `buildReportChartPoints`, `buildReportSummary`, `reportFileName` from `@/lib/patientReport` (Task 1); `buildEvolutionChartGeometry` from `@/lib/patientReportChart` (Task 2); `getClinicBranding` from `@/lib/clinicBranding`; the route's existing `patient`, `responses`, `clinicalConfig`.
- Produces: nothing further consumes this (end of the chain). The button calls `pdf(<PatientReportDocument .../>).toBlob()` via dynamic `import("@react-pdf/renderer")` and dynamic `import("@/components/PatientReportDocument")`.

- [ ] **Step 1: Install the dependency**

Run: `npm install @react-pdf/renderer`
Then confirm the resolved version isn't from the last 24h (`npm view @react-pdf/renderer time --json`, check the published date for the installed version); if it is, pin the previous stable version instead and reinstall.

- [ ] **Step 2: Add a clinic branding query in `_app.pacientes.$id.tsx`**

Reuse the exact query key/shape already used by `src/components/ClinicLogo.tsx`:

```ts
const { data: branding } = useQuery({
  queryKey: ["clinic-branding"],
  queryFn: getClinicBranding,
  staleTime: 5 * 60 * 1000,
});
```

Add the import: `import { getClinicBranding } from "@/lib/clinicBranding";`

- [ ] **Step 3: Add the `generateReport` mutation**

```ts
const generateReport = useMutation({
  mutationFn: async () => {
    if (!patient) throw new Error("Paciente não carregado");
    const [{ pdf }, { PatientReportDocument }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("@/components/PatientReportDocument"),
    ]);
    const summary = buildReportSummary(patient, responses, clinicalConfig);
    const geometry = summary.hasScorableData
      ? buildEvolutionChartGeometry(
          buildReportChartPoints(responses),
          clinicalConfig.programLengthDays,
          clinicalConfig,
        )
      : null;
    const blob = await pdf(
      <PatientReportDocument
        clinicLogoUrl={branding?.logoUrl ?? null}
        summary={summary}
        geometry={geometry}
      />,
    ).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = reportFileName(patient.name);
    a.click();
    URL.revokeObjectURL(url);
  },
  onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar relatório"),
});
```

Add the imports: `buildReportChartPoints, buildReportSummary, reportFileName` from `@/lib/patientReport`; `buildEvolutionChartGeometry` from `@/lib/patientReportChart`.

- [ ] **Step 4: Add the button**

In the action-buttons row (`src/routes/_app.pacientes.$id.tsx:572-590`), add, after "Enviar lembrete":

```tsx
<Button
  variant="outline"
  onClick={() => generateReport.mutate()}
  disabled={generateReport.isPending}
>
  {generateReport.isPending ? (
    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
  ) : (
    <FileDown className="h-4 w-4 mr-2" />
  )}
  Emitir relatório
</Button>
```

Add `FileDown` to the `lucide-react` import list at the top of the file.

- [ ] **Step 5: Manually verify in the browser**

Run: `npm run dev`
Open a patient with several days of responses: click "Emitir relatório", confirm a PDF named `relatorio-<nome>-<data>.pdf` downloads, and that it shows the clinic header (logo or "Vera PSI"), patient name + start date, "Dia X de {programLengthDays}" + criticality, the evolution chart with the three colored bands and a line matching the on-screen "Evolução" tab, and (if the program isn't finished) the "Relatório parcial" note.

Then open a patient with zero responses and confirm the PDF shows "Sem dados suficientes para gerar o gráfico de evolução." instead of a broken/empty chart.

Then run `npm run build` once to confirm `@react-pdf/renderer` does not break the Cloudflare Workers SSR build (it must not appear in any eagerly-loaded/server chunk — only in a separate, lazily-loaded chunk).

- [ ] **Step 6: Commit**

```bash
git add src/routes/_app.pacientes.$id.tsx package.json package-lock.json
git commit -m "feat: add 'Emitir relatório' button to patient detail page"
```
