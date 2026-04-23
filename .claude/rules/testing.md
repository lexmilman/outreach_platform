# Testing rules

## Unit (Vitest)
- Colocate tests: `foo.ts` → `foo.test.ts`.
- Use `jsdom` for component tests, default node for pure utilities.
- Every zod schema gets a smoke test against a golden fixture from `test/fixtures/`.
- Mock Supabase via the `@/test/mocks/supabase` helper — never a real network call.

## External APIs (MSW)
- All HTTP to Apify / FindyMail / SignalHire / Instantly / Perplexity / LLM providers must be intercepted via MSW handlers in `test/mocks/handlers.ts`.
- Each provider client supports a `MOCK_<PROVIDER>=1` env flag that returns fixtures without hitting the network, for local dev without MSW.

## E2E (Playwright)
- Critical paths only: `auth.spec.ts`, `csv-import.spec.ts`, `enrichment-run.spec.ts`, `push-instantly.spec.ts`.
- Run against a **dedicated test Supabase project** — never production. Use `TEST_SUPABASE_URL`/`TEST_SUPABASE_PUBLISHABLE_KEY`/`TEST_SUPABASE_SERVICE_ROLE_KEY`.
- Reset the DB between specs via `supabase db reset`.

## Coverage targets
- `src/lib/**/*.ts`: ≥ 80% lines.
- `src/lib/integrations/**/*`: 100% of error-path branches.
- Route handlers + Server Actions: covered by E2E.

## Rules
- Never disable a failing test with `.skip` without a tracking TODO.
- Never `console.log` from inside tests.
- Treat a single-flake test as a bug; rerun 3× locally before commit.
