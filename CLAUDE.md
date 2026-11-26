# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A patient-follow-up system for a mental-health clinic ("Vera PSI" in the UI), centered on a
configurable-length (default 30-day) program: patients fill a daily evolution diary via a public
tokenized link, and the clinical team (admin / psychologist / psychiatrist) monitors progress,
criticality, clinical records, and appointments. The UI is entirely in Brazilian Portuguese
(`pt-BR`).

This is a plain **Vite SPA** using **TanStack Router** (client-side, file-based routing) and
**React 19** — there is no SSR and no TanStack Start. It's deployed to **Vercel**: the built SPA
is served as static files with a catch-all rewrite to `index.html` (`vercel.json`), and everything
under `api/` deploys as Vercel serverless functions (`@vercel/node`).

## Commands

Package manager is **npm** (`package-lock.json`).

```bash
npm install            # install deps
npm run dev             # dev server (vite dev)
npm run build            # production build
npm run preview          # preview the production build
npm run lint             # eslint .
npm run format           # prettier --write .
npx tsc --noEmit        # type-check (no dedicated script; tsconfig is noEmit)
```

There is no test script wired into `package.json`, but a real suite exists under `tests/` (pure
logic + a handful of `api/` modules), run directly with:

```bash
node --test tests/*.test.mjs
```

One file (`tests/inbound.test.mjs`) currently fails on recent Node versions due to an unrelated
`node --test`/ESM module-resolution regression (`mock.module` / sibling `.ts`→`.js` resolution),
not a real bug — this is a known, pre-existing environment issue, not something to "fix" by
changing the test or the source it covers.

**Hard constraint for everything under `api/`:** Vercel's build (`@vercel/node`) transpiles each
traced `.ts` file to a same-named `.js` file **without rewriting import specifiers**. Any file
under `api/` that imports a sibling module (including anything in `src/lib`) using an explicit
`.ts` extension ships broken in production — the bundle only contains the `.js`-renamed output,
but the import statement still says `.ts`. Every local/relative import inside `api/` must use a
`.js` extension, even though the source file is `.ts`, with no exceptions. This is enforced by a
static regression test (`tests/apiImportsNoTsExtension.test.mjs`) that scans `api/**/*.ts` for any
`.ts`-extension import specifier and fails if one exists.

## Architecture

### Data layer — direct Supabase calls + Vercel functions, no abstraction layer

There is no `src/services/api.ts`-style data-access abstraction in active use. `src/services/api.ts`
and `src/services/mockBackend.ts` still exist in the repo but have **zero imports anywhere** —
they're dead code from an earlier mock-backend era. Do not add new endpoints there and do not
treat them as documentation of current behavior.

The real data layer is split by trust level:

- **Route files read/write Supabase directly** with the anon key (`src/lib/supabase.ts`), relying
  on Supabase RLS for authorization — e.g. `supabase.from("patients").select(...)` straight inside
  a route component.
- **Privileged or side-effecting actions go through `api/`** (Vercel serverless functions), using
  `supabaseAdmin` (service-role key, never exposed to the browser) and `requireUser`/`requireAdmin`
  from `api/_lib/requireAdmin.ts` for auth gating. This is where WhatsApp dispatch, appointment
  creation, form submission, and the daily cron reminder live.

### Forms — one system today, not two

`src/lib/forms-store.ts` (`FormDef`/`FormField`) is the **real, only** form-authoring system: it
reads/writes the Supabase `forms` table, and forms built in `/formularios` are exactly what gets
served to patients. The public diary (`/formulario/$token`) fetches and submits through
`api/forms/get-by-token.ts` and `api/forms/submit.ts`, both backed by the same `forms` table.
`src/lib/formQuestions.ts` (a hardcoded fixed set of 5 questions from an earlier iteration) is
obsolete and unused — see the doc comment at the top of `forms-store.ts` for the migration note.

The older `Question`/`ResponseEntry` vocabulary in `types.ts` is still very much alive, but at a
different layer: it's how `form_responses` rows (whatever `FormField`s a given form actually has)
get interpreted for criticality and reporting (`src/lib/criticality.ts`,
`src/hooks/useEnrichedPatients.ts`, `src/lib/patientReport.ts`). It is not a competing form system,
just the analysis-side shape of a response.

### Domain logic — `src/lib/criticality.ts` + `src/hooks/useEnrichedPatients.ts`

Criticality (`red`/`yellow`/`green`/`unknown`) and `programDay` are computed **client-side** from
raw responses, not stored. Program length and the red/yellow thresholds are configurable (stored
in `app_settings`, read via `src/hooks/useClinicalConfig.ts`, with `DEFAULT_CLINICAL_CONFIG` in
`criticality.ts` as the fallback) — **never hardcode the program length**; read
`clinicalConfig.programLengthDays` instead. `useEnrichedPatients()` joins patients with their
responses via React Query and attaches `criticality`, `daysSinceLast`, and `programDay`. Use this
hook rather than re-deriving these values.

### Routing — TanStack Router, file-based

- `src/routeTree.gen.ts` is **auto-generated** — never edit it by hand.
- Routes live in `src/routes/` with dotted flat naming. The `_app` prefix
  (`_app.dashboard.tsx`, `_app.pacientes.$id.tsx`, …) = the authenticated layout
  (`_app.tsx` → `AppShell`). `login.tsx` and `formulario.$token.tsx` are public.
- Auth gating is **client-side in `AppShell`** (`src/components/AppShell.tsx`): it redirects to
  `/login?redirect=...` when no user. `_app.tsx`'s `beforeLoad` only redirects `/` → `/dashboard`.

### Auth — `src/lib/auth-context.tsx`

`AuthProvider` (mounted in `__root.tsx`) wraps **Supabase Auth** directly
(`supabase.auth.signInWithPassword`, `supabase.auth.onAuthStateChange`,
`supabase.auth.getSession()`) and exposes `useAuth()`. There is no separate token/localStorage
scheme to maintain — session persistence is whatever the Supabase client already does.

### Appearance / theming — `src/lib/appearance.ts`

Theme color, light/dark/auto, contrast, locale, and date/time prefs persist in localStorage
(`clinica:appearance`) and apply as CSS variables on `<html>` via `initAppearance()` (called in
`AppShell`). The primary color is a runtime CSS var, not a fixed Tailwind token.

## Conventions

- **Import alias:** `@/` → `src/` (e.g. `@/components/ui/button`, `@/lib/utils`, `@/lib/supabase`).
- **UI:** shadcn/ui (new-york style) in `src/components/ui/` + Tailwind v4. Use the `cn()` helper
  from `@/lib/utils`. Add components via the shadcn CLI (config in `components.json`); avoid hand-editing
  generated `ui/` primitives.
- **Formatting:** Prettier — 100 col, semicolons, double quotes, trailing commas (`all`).
- Data fetching uses **TanStack React Query**; forms use **react-hook-form + zod**; toasts use **sonner**.
