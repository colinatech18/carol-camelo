# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A patient-follow-up system for a mental-health clinic ("Vera PSI" in the UI), centered on a
30-day program: patients fill a daily evolution diary via a public tokenized link, and the
clinical team (admin / psychologist / psychiatrist) monitors progress, criticality, clinical
records, and appointments. The UI is entirely in Brazilian Portuguese (`pt-BR`).

This is a Lovable-generated project (`@lovable.dev/vite-tanstack-config`) built on **TanStack
Start** (SSR React 19) and deployed to **Cloudflare Workers**.

## Commands

Package manager is **Bun** (`bun.lock`, `bunfig.toml`).

```bash
bun install            # install deps
bun run dev            # dev server (vite dev)
bun run build          # production build (also targets Cloudflare Workers)
bun run build:dev      # build with development mode
bun run preview        # preview the production build
bun run lint           # eslint .
bun run format         # prettier --write .
bunx tsc --noEmit      # type-check (no dedicated script; tsconfig is noEmit)
```

There is **no test suite** configured — do not assume `bun test` exists.

`bunfig.toml` enforces a 24h supply-chain guard (`minimumReleaseAge`): newly published package
versions are skipped. Confirm with the user before adding any package to
`minimumReleaseAgeExcludes`.

## Architecture

### Data layer is the central abstraction — `src/services/`

All data access goes through `src/services/api.ts`. It exposes domain APIs (`api.auth`,
`api.patients`, `api.forms`, `api.records`, `api.appointments`, `api.notifications`,
`api.settings`) and **switches at runtime** between two backends:

- **Real backend** when `VITE_API_URL` is set — Axios calls with `Bearer` token from
  `localStorage` (`mh.token`), `withCredentials: true`.
- **Mock backend** (`USE_MOCK === true`) when `VITE_API_URL` is empty — `src/services/mockBackend.ts`,
  fully localStorage-backed (keys prefixed `mh.*`), self-seeds demo users/patients/responses on
  first load. Every `api.*` method has a `USE_MOCK` branch.

When adding an endpoint, add it to **both** the `USE_MOCK` branch (wired to `mockApi`) and the
real HTTP branch in `api.ts`, and implement the mock in `mockBackend.ts`. Keep the two in sync.

### Two separate "forms" systems — don't confuse them

1. **Legacy daily questions** (`api.forms` + `Question`/`ResponseEntry` in `types.ts`): the 1–5
   scale diary used by the public form (`/formulario/$token`) and criticality. Lives in the
   `api.ts`/`mockBackend.ts` abstraction.
2. **Multi-form builder** (`src/lib/forms-store.ts`, `FormDef`/`FormField`): a richer drag-and-drop
   form designer (`/formularios`). This is a **standalone localStorage store** (`mh.forms.v2`),
   *not* routed through `api.ts`. It self-seeds its own forms and is intentionally decoupled.

### Domain logic — `src/lib/criticality.ts` + `src/hooks/useEnrichedPatients.ts`

Criticality (`red`/`yellow`/`green`/`unknown`) and `programDay` (1..30) are computed **client-side**
from raw responses, not stored. `useEnrichedPatients()` joins patients with their responses via
React Query and attaches `criticality`, `daysSinceLast`, and `programDay`. Use this hook rather
than re-deriving these values. Red = avg of last 3 entries < 2.5; yellow ≤ 3.5; green above.

### Routing — TanStack Router, file-based

- `src/routeTree.gen.ts` is **auto-generated** — never edit it by hand.
- Routes live in `src/routes/` with dotted flat naming. The `_app` prefix
  (`_app.dashboard.tsx`, `_app.pacientes.$id.tsx`, …) = the authenticated layout
  (`_app.tsx` → `AppShell`). `login.tsx` and `formulario.$token.tsx` are public.
- Auth gating is **client-side in `AppShell`** (`src/components/AppShell.tsx`): it redirects to
  `/login?redirect=...` when no user. `_app.tsx`'s `beforeLoad` only redirects `/` → `/dashboard`.

### Auth — `src/lib/auth-context.tsx`

`AuthProvider` (mounted in `__root.tsx`) holds the user, calls `authApi.me()` on mount if a token
exists, and exposes `useAuth()`. Token persistence lives in `api.ts` (`getToken`/`setToken`).

### SSR error handling — deliberate, don't simplify away

`src/server.ts` is a **custom Cloudflare Worker entry** (wired via `vite.config.ts`
`tanstackStart.server.entry: "server"`, not just `wrangler.jsonc`). It exists because h3 swallows
in-handler throws into a generic `{"unhandled":true,"message":"HTTPError"}` 500 that `try/catch`
never sees. The flow: `error-capture.ts` records the real error out-of-band → `server.ts` detects
the swallowed-error body and renders a branded page via `error-page.ts`. `start.ts` adds matching
request middleware. Preserve this machinery when touching server/error code.

### Appearance / theming — `src/lib/appearance.ts`

Theme color, light/dark/auto, contrast, locale, and date/time prefs persist in localStorage
(`clinica:appearance`) and apply as CSS variables on `<html>` via `initAppearance()` (called in
`AppShell`). The primary color is a runtime CSS var, not a fixed Tailwind token.

## Conventions

- **Import alias:** `@/` → `src/` (e.g. `@/components/ui/button`, `@/lib/utils`, `@/services/api`).
- **UI:** shadcn/ui (new-york style) in `src/components/ui/` + Tailwind v4. Use the `cn()` helper
  from `@/lib/utils`. Add components via the shadcn CLI (config in `components.json`); avoid hand-editing
  generated `ui/` primitives.
- **Server-only modules:** do NOT import the Next.js `server-only` package (eslint blocks it). Use
  `*.server.ts` or `@tanstack/react-start/server-only`.
- **vite.config.ts:** `@lovable.dev/vite-tanstack-config` already includes tanstackStart, viteReact,
  tailwindcss, tsConfigPaths, cloudflare, the `@` alias, and error loggers. Do **not** re-add these
  plugins manually — it breaks the build. Extend via `defineConfig({ vite: { ... } })`.
- **Formatting:** Prettier — 100 col, semicolons, double quotes, trailing commas (`all`).
- Data fetching uses **TanStack React Query**; forms use **react-hook-form + zod**; toasts use **sonner**.
