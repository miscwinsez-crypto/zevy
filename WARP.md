# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## What this repo is
- A **Next.js 14 (App Router)** web app for “Zevy AI” (multi-model chat UI + API routes) intended to be deployed on **Vercel**.
- API routes live under `app/api/*` and are implemented as Next.js Route Handlers.
- Environment variables are expected to come from Vercel at runtime (see `lib/env.ts`).
- Vercel-specific defaults/config are in `vercel.json` (e.g., `NEXT_PUBLIC_API_URL`).

## Common commands

### Install
```sh
yarn install
```

### Run dev server
```sh
yarn dev
```

On Windows, there is also a helper script that pins host/port and sets `NEXT_PUBLIC_API_URL`:
```powershell
.\start-dev.ps1
```

### Build / start
```sh
yarn build
yarn start
```

### Lint
```sh
yarn lint
```

Lint a single file (Next.js lint wrapper):
```sh
yarn next lint --file app/page.tsx
```

### Typecheck
No dedicated script is defined in `package.json`, but TypeScript is configured via `tsconfig.json`:
```sh
yarn tsc --noEmit
```

### Tests
There is no unit/integration test runner configured (no `test` script in `package.json`).

There are ad-hoc connectivity scripts:
- `node test-model-connectivity.js` (expects `GOOGLE_API_KEY` set)

## High-level architecture

### Runtime entrypoints
- UI: `app/page.tsx` is the main **client component** that renders the chat UX and calls the API routes.
- Layout/shell: `app/layout.tsx`

### API routes (server)
- `app/api/chat/route.ts`
  - Core chat orchestration.
  - Selects Astra model variants (fast vs smart) and supports “Vyra” debate mode.
  - Optional web research mode via `GroqCompound`.
  - Content moderation using Groq (guard model).
  - Usage limiting via Supabase (`app/lib/usage-tracking.ts`).
- `app/api/health/route.ts`
  - Health endpoint that reports Vercel/env configuration and Supabase client initialization.
- `app/api/image/route.ts`
  - Currently returns “image generation unavailable” (contains a Flux-based handler stub).
- `app/api/auth/*`
  - `login`, `signup`, `logout`, `verify` are currently “demo mode” auth endpoints.
  - `callback` is a Supabase OAuth callback (exchanges `code` for session).

### Environment variable access / Vercel-only behavior
- `lib/env.ts` is the central guardrail:
  - Allow-lists which env vars can be read.
  - `assertVercelOnly()` is used by endpoints to enforce Vercel-only execution (some routes skip this when `NODE_ENV === 'development'`).
- `next.config.js` sets `typescript.ignoreBuildErrors: true`, so CI/builds may succeed even with TS type errors.

### Groq keys + “compound” browsing
- `app/lib/groq-keys.ts`
  - Cycles through `GROQ_API_KEY_1..10` (round-robin) to pick a key.
- `app/lib/groq-compound.ts`
  - Aggregates information from Google Custom Search (if configured) and free sources (Wikipedia/Wikidata/DBpedia/News).
  - Returns a synthesized “context blob” that `app/api/chat/route.ts` injects into the model prompt when search is enabled.
- `app/lib/cache.ts` is an in-memory TTL cache used by server routes.

### Supabase integration
- Client-side Supabase: `lib/supabase.ts` (exports `supabase`)
- Server-side Supabase (SSR): `lib/supabase/server.ts` (`createServerClient` wired to Next cookies)
- Route-handler helper: `app/lib/supabase.ts` (`createRouteHandlerClient`)

Usage tracking:
- Logic: `app/lib/usage-tracking.ts` uses a `user_usage` table with `model_type`, `usage_count`, and `last_reset`.
- Migration: `supabase/migrations/20240101000000_add_usage_tracking.sql`.
- Note: `lib/database.types.ts` does not appear to match the migration shape (it defines `request_count` instead of `usage_count` / `model_type`).

### Duplicate sub-project directories
The repo contains additional nested copies under `zevy/` and `zevy-main/`. The primary app appears to be the repository root (the one with the top-level `app/`, `lib/`, and `package.json`).