# Phased plan

## Sprint 1 — Bootstrap + Auth + Clients (MVP shell)
- [x] Scaffold Next.js 15 + Tailwind v4 + shadcn + fonts + theme toggle
- [x] Supabase project + all migrations 00–06 applied
- [x] Magic-link auth, middleware protection, sign-out
- [x] Clients CRUD with Server Actions
- [x] `/ship "feat: bootstrap + auth + clients"`

## Sprint 2 — CSV import + global people/companies + Clay table
- [x] `src/lib/csv/` parse + auto-map (papaparse + fuse.js)
- [x] CSV importer UI: 3-step wizard (upload / map / review+run)
- [x] Full virtualized grid with 8 cell types (text, number, date, url, email, avatar, score-badge, company-chip)
- [x] Dedup on LinkedIn URL + fuzzy name+domain (DB-side via `bulk_upsert_people` RPC)
- [x] Realtime hook for live updates (debounced, updates visible rows only)
- [x] Read-only PersonDrawer + CompanyDrawer
- [x] Inline cell edits via whitelisted `update_person_fields` RPC
- [x] `/ship "feat(sprint-2): csv import + people/company grid + realtime"`
- Deferred to Sprint 3+: filter builder UI, saved views UI, bulk action bar, JSON/Tag/Status cells, column virtualization.

## Sprint 3 — Enrichment pipeline + scoring + messages
- [ ] Apify (3 actors) + FindyMail + SignalHire + Instantly verify clients
- [ ] Worker Edge Function + pgmq queue + pg_cron + DLQ + job_runs observability
- [ ] Webhooks (Apify, SignalHire, Instantly)
- [ ] LLM layer (Vercel AI SDK) with pricing
- [ ] Prompt rendering + versioning (skip A/B for MVP)
- [ ] Scoring + message generation jobs
- [ ] `/ship "feat: enrichment + scoring + message generation"`

## Sprint 4 — Push to Instantly + analytics (MVP ships)
- [ ] Create Instantly campaign from UI (with sequence templates)
- [ ] Bulk push leads with custom variables
- [ ] Daily Instantly analytics sync
- [ ] Analytics dashboard (per-client + per-campaign)
- [ ] Cost tracking breakdown
- [ ] Playwright smoke tests green
- [ ] `/ship "feat: instantly push + analytics — MVP complete"`

## Sprint 5+ — Full phase
- [ ] LinkedIn posts enrichment + Perplexity custom research
- [ ] AI natural-language search over global DB
- [ ] Prompt management UI with A/B testing
- [ ] Multi-email waterfall (tier escalation)
- [ ] Webhook-driven reply handling + positive-reply export per client
- [ ] Sales Navigator URL → public URL converter
- [ ] Multi-provider LLM switching UI
- [ ] Advanced conditional workflows in campaign wizard
- [ ] Bulk A/B test result analysis (two-proportion z-test)

## Definition of done (per sprint)
1. `pnpm lint && pnpm typecheck && pnpm test` all green.
2. Playwright smoke tests for the sprint's happy path green (or marked TODO with tracking ticket).
3. CLAUDE.md + docs updated to reflect any new conventions.
4. Commit message follows conventional commits; pushed to branch; PR opened only if explicitly asked.
