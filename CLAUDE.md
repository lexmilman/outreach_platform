# Project: Leadflow

Cold email outreach automation. LinkedHelper CSV → global Supabase DB → Apify/FindyMail/SignalHire/LLM enrichment → Instantly.ai send → reply analytics.

Single user (agency operator) managing N client campaigns. All background work on Supabase (pgmq + pg_cron + Edge Functions). No external workers.

## Stack
- Next.js 15 (App Router, RSC, Server Actions), TypeScript strict, React 19
- Tailwind CSS v4 (CSS-first, `@theme` directive), shadcn/ui (new-york), lucide-react
- Supabase (Postgres 15.6+, Auth, Storage, Realtime, Edge Functions, pgmq, pg_cron, pg_net)
- `@supabase/ssr`, `@tanstack/react-table`, `@tanstack/react-virtual`, `@tanstack/react-query`
- Vercel AI SDK v5+ (multi-provider: OpenAI, Anthropic, Google, xAI, Perplexity)
- papaparse, fuse.js, zod, react-hook-form, next-themes, sonner
- Vitest + Playwright + MSW
- Deployed on Vercel (Production = main, Preview = all other branches)

## Commands
- `pnpm dev` — Next dev server (Turbopack)
- `pnpm build` — production build
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` — ESLint + Prettier
- `pnpm test` — Vitest
- `pnpm test:e2e` — Playwright (requires TEST_SUPABASE_* env)
- `pnpm db:types` — regenerate `src/types/supabase.ts`
- `pnpm db:push` — apply migrations to remote
- `pnpm db:local` — `supabase start` + `supabase db reset`
- Before every commit: `pnpm lint && pnpm typecheck && pnpm test`
- Use `/ship "feat(scope): message"` after each milestone to run tests + commit + push.

## Core rules

### Validation (non-negotiable)
- **Every external API response** MUST be parsed via a **zod schema** from `src/lib/integrations/<provider>/schemas.ts`. Never cast `as Foo` on untrusted data.
- **Every Server Action input** must be `schema.safeParse(formData)` at the top.
- **CSV rows** must pass `LeadSchema.safeParse` before insert. Rejected rows go into an import_errors list shown to the user.
- **Before using data from APIs**, always verify key fields match expected shape AND log counts (`logger.info({inputCount, enrichedCount, failedCount})`) so we can detect silent drift.
- Webhook payloads are parsed through their schema **before** DB writes.

### DB migrations
- Every schema change = a new numbered file in `supabase/migrations/`. Never edit an applied migration.
- After adding/changing any table, run `pnpm db:types` and update `src/lib/schemas/` zod types to match.
- All new tables must: have `created_at`, enable RLS, add org-scoped policy, add appropriate indexes (FK columns + filter columns + GIN on JSONB).

### Secrets
- Never read `.env*` files. Never log `process.env.*_KEY` values.
- Server-only secrets: `import "server-only";` at top of `src/lib/env.server.ts`, `src/lib/supabase/admin.ts`.
- Public vars must be `NEXT_PUBLIC_*`.
- `SUPABASE_SERVICE_ROLE_KEY` only used in Edge Functions and `src/lib/supabase/admin.ts`.

### Auth
- Server: always `supabase.auth.getClaims()` in middleware or `supabase.auth.getUser()` in Server Components/Actions. Never `getSession()` server-side.

### Architecture
- Route files thin (fetch + render). Business logic in `src/lib/`.
- External API calls only through `src/lib/integrations/<provider>/client.ts`. No direct `fetch` to third-party APIs elsewhere.
- LLM calls only through `src/lib/ai/call-llm.ts`.
- Background work only through `public.enqueue_job` RPC → worker Edge Function.
- Default to Server Components; `"use client"` only for event handlers, state, browser-only libs.

### Testing
- Unit: colocate `foo.ts` → `foo.test.ts` (Vitest).
- E2E critical paths: `e2e/auth.spec.ts`, `e2e/csv-import.spec.ts`, `e2e/enrichment-run.spec.ts`, `e2e/push-instantly.spec.ts`.
- Mock external APIs via MSW in `test/mocks/handlers.ts`. Never hit real Apify/FindyMail/SignalHire/Instantly in tests.

### Git workflow
- **Conventional commits**: `feat:` `fix:` `chore:` `docs:` `refactor:` `test:` `perf:`. Subject ≤72 chars, imperative.
- **Production branch**: `claude/cold-email-platform-3anvC` (Vercel's "Production" in this repo — there is no `main`). Commit and push **directly** to this branch. No feature branches, no PRs, no merging.
- If a previous session left behind a `claude/<slug>` feature branch, fast-forward merge it into the production branch and keep committing there.
- **Auto-push after every successful milestone** via the `/ship "feat(scope): …"` slash command. The command runs `pnpm lint && pnpm typecheck && pnpm test`; only commits + pushes if all pass.
- Never force-push the production branch.

### Operator profile — read this before any non-trivial work
The person behind the keyboard is the agency operator, **not a programmer**. Tune your output accordingly:
- **Plain language**. No jargon unless you define it in the same sentence. "PostgREST schema cache" → "the API layer that caches function signatures; Supabase reloads it automatically after DDL".
- **Step-by-step, copy-pasteable**. When you need them to run something, give the exact click path or SQL block. Never assume they'll figure out the right CLI flag.
- **Show, don't just tell**. After a non-trivial change, tell them exactly what to look at (URL, SQL query, Dashboard panel) and what "good" looks like.
- **Verify on the running app, not in your head**. The operator cannot read code. Unit tests passing does NOT equal feature working. Always end a feature with: "open `<URL>`, do `<action>`, you should see `<outcome>`".
- **When something goes wrong, explain the root cause in 2-3 sentences** before fixing. They want to understand, not just see the diff.
- **Prefer SQL in the Dashboard SQL Editor over local CLI**. They haven't set up `supabase` CLI locally. For migrations, always generate a ready-to-paste `scripts/hotfix-<name>.sql` alongside the migration file.
- **No local Edge Function deploys** without explicit opt-in. When code needs Edge Functions updated, either: (a) set up GitHub Actions so it deploys on push, or (b) give them inline Dashboard-paste instructions. Do not ask them to run `supabase functions deploy`.

### Code style
- ESM only, `import` syntax.
- Named exports (except Next.js route files).
- kebab-case filenames for components, camelCase for utils.
- No `any`. Use `unknown` + zod.
- Early returns over nested ifs.
- `prettier-plugin-tailwindcss` enforced.

## Folder conventions — see docs/ARCHITECTURE.md
## Data model — see docs/DATA-MODEL.md
## Phased plan — see docs/PLAN.md

## Detailed rules
- @.claude/rules/supabase.md
- @.claude/rules/testing.md
- @.claude/rules/integrations.md
- @.claude/rules/ui.md
- @.claude/rules/csv-import.md
