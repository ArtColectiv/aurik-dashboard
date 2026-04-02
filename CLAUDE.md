# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

This is a monorepo with two independent Next.js applications sharing a git root:

- **`/` (root)** — The main Aurik Dashboard app (agent management, skill packs, marketing)
- **`aurik-posting/`** — A separate Next.js app for social media post drafting and publishing

Each app has its own `package.json`, `tsconfig.json`, and `node_modules`. Run commands from the correct directory.

## Commands

### Root app (`/Users/admin/Documents/aurik-dashboard/`)
```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Production build
npm run lint     # ESLint check
```

### Aurik-Posting (`aurik-posting/`)
```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # ESLint check
```

There are no test scripts configured in either app.

## Root App Architecture

**Stack:** Next.js App Router, TypeScript (strict), Tailwind CSS v4, Supabase, OpenAI

### Key directories
- `app/` — Pages and API routes (App Router)
- `lib/aurik/` — Core business logic (56 files, domain-organized)

### `lib/aurik/` domain modules
- `agents/` — Agent types and interfaces
- `autonomy/` — Autonomous execution logic
- `decision/` — Decision engine
- `learning/` — Scoring engines: `aurikScore`, `aurikBadgeEngine`, `marketingLearningEngine`, `experimentPrediction`
- `reels/` — Video/reel generation (scenes, scripts, assets, storage)
- `skillpacks/` — Skill pack definitions and types
- `supabaseServer.ts` — Server-side Supabase client

### API routes
- `/api/agents` — Agent data
- `/api/skill-packs` — Skill pack CRUD
- `/api/marketing` — Marketing actions
- `/api/run-task` — Task execution
- `/api/internal/*` — Internal utilities

### Supabase views/tables used
- `agent_overview`, `agent_events` — Agent metrics
- `skill_packs` (filtered by `ecosystem_id = "default"`)

### Path alias
`@/*` resolves to the repo root (`/`).

## Aurik-Posting App Architecture

**Stack:** Next.js App Router, TypeScript (strict), Tailwind CSS v4, Supabase Auth

### Key directories
- `src/app/` — Pages and API routes
- `src/lib/supabase/` — Two Supabase clients:
  - `client.ts` — Anonymous/user auth (browser)
  - `server.ts` — Service role (server-side, uses `supabaseServer()`)

### Pages
`/dashboard`, `/posts`, `/login`, `/connections`, `/jobs`, `/published`, `/metrics`, `/usage`, `/billing`

### API routes
- `/api/drafts/create` — Create post drafts
- `/api/worker/publish` — Async publish worker
- `/api/worker/metrics` — Worker metrics
- `/api/billing/switch` — Billing plan changes
- `/api/health`, `/api/health/secure` — Health checks

### Supabase tables used
`posting_users`, `posting_post_drafts`, `posting_jobs`

### Path alias
`@/*` resolves to `./src/*` (note: differs from root app).

## Environment

Both apps require `.env.local` files with Supabase credentials. The root app also needs an OpenAI API key.
