# Supabase rules

## Clients
- **Browser client** — `src/lib/supabase/client.ts`. Uses `createBrowserClient` from `@supabase/ssr` and the **publishable** key. Safe to import in Client Components.
- **Server client** — `src/lib/supabase/server.ts`. Uses `createServerClient` with a cookie adapter pointing at `next/headers`. Use in Server Components, Server Actions, Route Handlers.
- **Middleware client** — `src/lib/supabase/middleware.ts`. Used only by `src/middleware.ts` to refresh the session cookie on every request.
- **Admin client** — `src/lib/supabase/admin.ts` (`import "server-only"`). Uses the `SUPABASE_SERVICE_ROLE_KEY`. Never import this from a Client Component. Only use for: webhook handlers, cron jobs, seed scripts, and explicit admin-only Server Actions that bypass RLS.

## Auth
- Server Components + Actions: `supabase.auth.getUser()` (JWT is verified against Auth API).
- Middleware: `supabase.auth.getClaims()` for fast path cookie validation.
- **Never** call `supabase.auth.getSession()` on the server — the session cookie is not JWT-verified.
- Magic link flow uses `{{ .TokenHash }}` with `/auth/confirm?token_hash=...&type=email` → `verifyOtp`.

## Queries
- Prefer `.select("col1, col2")` over `.select("*")`. Always list columns.
- Every `.insert / .update / .delete` in a Server Action must first run `schema.safeParse(input)`.
- Foreign key joins: `.select("id, client:clients(id, name)")`.
- For large tables (people, companies, enrichments): always paginate with `.range(from, to)`.

## Realtime
- Subscribe in Client Components via `useRealtimeTable(table, filter)` hook.
- Always filter by `org_id=eq.<uuid>` to avoid cross-org leaks even though RLS also blocks.

## Background jobs
- Never call external APIs inside a Server Action — enqueue a job via the `enqueue_job(p_type, p_payload, p_org_id)` RPC instead.
- Job handlers live in `supabase/functions/worker/index.ts`.
- Every job writes to `job_runs` with start/end timestamps and cost.

## RLS
- Every new table must `enable row level security`.
- Org-scoped tables: policy uses `org_id in (select private.current_org_ids())`.
- Global tables (people, companies, emails): readable by any authenticated user; writes only via service role.
- Never write RLS policies that reference `auth.users` directly — use the `memberships` table.
