# Leadflow

Cold email outreach automation for agency operators. LinkedHelper CSV →
global Supabase DB → Apify / FindyMail / SignalHire / LLM enrichment →
Instantly.ai send → reply analytics. One cockpit, N client campaigns.

## Quickstart

```bash
pnpm install
cp .env.example .env.local            # fill in Supabase + provider keys
pnpm db:local                         # boot local Supabase + apply migrations
pnpm dev                              # http://localhost:3000
```

## Commands

| Command | What |
|---|---|
| `pnpm dev` | Next dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint + Prettier |
| `pnpm test` | Vitest |
| `pnpm test:e2e` | Playwright (requires `TEST_SUPABASE_*` env) |
| `pnpm db:types` | Regenerate `src/types/supabase.ts` |
| `pnpm db:push` | Apply migrations to remote |
| `pnpm db:local` | Boot local Supabase + reset DB |
| `pnpm functions:deploy` | Deploy all Edge Functions |

Before every commit: `pnpm lint && pnpm typecheck && pnpm test`. Use
`/ship "feat(scope): message"` after each milestone.

## Supabase setup

1. Create a Supabase project, link it: `supabase link --project-ref <ref>`.
2. Apply migrations: `pnpm db:push`.
3. Run once in the Supabase SQL editor:

   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<service_role_key>',        'service_role_key');
   ```

4. Deploy Edge Functions:

   ```bash
   supabase functions deploy worker
   supabase functions deploy webhooks-apify --no-verify-jwt
   supabase functions deploy webhooks-instantly --no-verify-jwt
   supabase functions deploy webhooks-signalhire --no-verify-jwt
   supabase functions deploy instantly-sync
   ```

5. Configure the Magic Link email template to use `{{ .TokenHash }}` → redirect
   to `/auth/confirm?token_hash=...&type=email`. A copy lives in
   `supabase/templates/magic-link.html`.

## Docs

- `CLAUDE.md` — project agent instructions
- `docs/ARCHITECTURE.md` — system diagram + layers
- `docs/DATA-MODEL.md` — table-by-table reference
- `docs/PLAN.md` — sprint roadmap
- `.claude/rules/*.md` — fine-grained rules for Supabase, testing, integrations, UI, CSV import

## Deploy

- **Production** (`main`) and **Preview** (any other branch) both auto-deploy on Vercel.
- Keep two Supabase projects: one for production, one for Playwright (`TEST_SUPABASE_*`).
- Never push to `main` without `pnpm lint && pnpm typecheck && pnpm test` green.
