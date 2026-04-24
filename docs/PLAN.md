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
- [x] **S3.1** worker observability: `/jobs` page (queue health + recent runs + DLQ replay), per-type discriminated zod payloads in `src/lib/queue`, `list_dlq` RPC, fixed `replay_dlq` bug
- [x] **S3.2** Apify (3 actors) client + webhook + worker handlers (`enrich_person_apify`, `enrich_company_apify`, `scrape_posts_apify`). Build pinning, MOCK_APIFY=1, finalize RPCs.
- [x] **S3.3** FindyMail + SignalHire + Instantly verify clients + waterfall lookup-by-request_id via `signalhire_pending_requests`. Linear escalation: findymail -> signalhire (async) -> verify_email_instantly.
- [x] **S3.4** LLM scoring + message generation. Single Anthropic call returning subject + 4 bodies + personalization, zod-validated. Prompt caching on the system block. Auto-chain: score >= 70 enqueues messages.
- [x] **S3.5** Perplexity custom research (`enrich_custom_perplexity`) — sonar-pro, citations preserved, merged into `people.data_json`.
- [x] **S3.6** Node integration test for the email waterfall (`src/lib/integrations/_scenarios/email-waterfall.test.ts`); `e2e/enrichment-run.spec.ts` shell behind .fixme() until `TEST_SUPABASE_*` is provisioned.
- [x] **S3.7** Bulk-enrichment toolbar on `/people` (Run on next N people without prior Apify enrichment).
- [x] `/ship "feat: enrichment + scoring + message generation"`

**Deferred to Sprint 4+:** waterfall_escalate handler (full multi-tier with parent/child campaigns), enrichment diff-viewer (before/after side-by-side), prompt management UI with A/B testing, per-org plan-rate config for credit pricing.

## Sprint 4 — Push to Instantly + analytics (MVP ships)
- [x] **S4.1** `sequence_templates` table + Instantly `createCampaign` client + worker `instantly_create_campaign` + `/campaigns` list + `/campaigns/new` wizard + `/campaigns/[id]` detail.
- [x] **S4.2** `list_pushable_leads` RPC + `push_to_instantly` worker handler (renders custom variables from `message_sequences`) + `mark_leads_pushed` transactional finalize + bulk-push panel on campaign page.
- [x] **S4.3** `webhooks-instantly` handler: auth, dedupe, `replies` upsert on reply events, `people_in_campaign.status` transitions, per-event `analytics_snapshots` counter increments.
- [x] **S4.4** `instantly-sync` Edge Function writes today's snapshot per running campaign. Cron entry was already scheduled in `00000000000004_cron.sql` ("instantly-daily-sync"). `syncCampaignStatsAction` lets the operator trigger a sync on demand.
- [x] **S4.5** `v_campaign_kpis` view + `analytics_summary` RPC + `/analytics` dashboard (client filter, date range, KPIs, daily bars, cost-by-provider breakdown, top campaigns table).
- [x] **S4.6** `e2e/push-instantly.spec.ts` scenario (behind `.fixme()` until `TEST_SUPABASE_*` is provisioned, same pattern as `enrichment-run.spec.ts`).
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
