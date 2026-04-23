# Data model

All tables live in the `public` schema. RLS is enabled on every table.

## Tenancy
- `organizations` — tenants. Today: one row.
- `memberships (user_id, org_id, role)` — joins Auth users to orgs.

## Global entities (shared across clients)
- `people` — canonical human record. Deduped by `linkedin_url` (unique). Secondary dedup via `dedup_key = sha256(lower(first_name || last_name || domain))`. JSONB for dynamic enrichments. Generated `search_doc tsvector` column for FTS.
- `companies` — canonical company record. Deduped by `linkedin_url` (unique). Citext `domain` for case-insensitive matching.
- `emails` — per-person email list. Each row tracks `source`, `verification_status`, `tier` (waterfall), `freshness_expires_at` (6mo). Unique `(person_id, email)`.

## Per-tenant entities
- `clients` — agency customers. `slug` unique per org.
- `audiences` — a named cohort, usually from one CSV import.
- `campaigns` — Instantly campaigns. `tier` + `parent_campaign_id` encode the waterfall chain.
- `people_in_campaign` — join table; stores per-lead interaction history (status, relevance score, generated emails, instantly_lead_id, waterfall_lead_id).
- `message_sequences` — per-lead generated `{subject, email_copy_1..4, personalization}`, linked to `prompt_version_id`.
- `replies` — inbound replies from Instantly webhooks.
- `analytics_snapshots` — daily per-campaign rollup from Instantly sync.

## Prompts & experiments
- `prompts (client_id, kind, name)` — top-level prompt definition. `kind ∈ {relevance, messages, enrichment}`.
- `prompt_versions (prompt_id, version)` — immutable template snapshots. One row has `is_active=true` at a time.
- `experiments` — A/B test config (`variant_a_id`, `variant_b_id`, 50/50 split).
- `prompt_runs` — every execution for offline analysis (rendered prompt, input vars, output, associated lead/campaign).

## Audit & billing
- `enrichments` — one row per external API call. Provider, endpoint, request/response JSON, outcome, credits, usd_cost, latency, error.
- `cost_tracking` — daily rollup by `(org, client, campaign, provider, day)`.
- `job_runs` — every queue job. Status, attempt, cost, output.

## Infrastructure tables
- `webhooks_log (provider, event_id)` — dedupe key for incoming webhook events. Admin-only read.
- `signalhire_pending_requests` — async SignalHire jobs, keyed by `request_id` returned on POST, resolved by callback.
- `instantly_sync_state` — cursor / last-sync-at per campaign.
- `api_integrations_config` — per-org API keys (vault-referenced), per provider.
- `llm_providers_config` — per-feature model choice (scoring, messages, enrichment, search).

## Dynamic schema (Clay-style)
- `custom_fields (org, entity, key, label, field_type)` — user-defined columns on `people` or `companies`. Values stored in the JSONB `data_json` column.
- `table_views` — per-user saved grid state (column order/visibility/sizing, filters, sorts).

## Queue
- `pgmq.q_jobs` — all background work.
- `pgmq.q_webhooks` — reserved for future buffered webhooks.
- `pgmq.q_dlq` — dead letter queue; replay via `replay_dlq(msg_id)` RPC.

## Triggers
- `tg_set_updated_at()` — applied to `clients`, `companies`, `people`, `campaigns`.

## Indexes of note
- `companies_search_idx`, `people_search_idx` — GIN on generated tsvector.
- `companies_trgm_name_idx`, `people_trgm_name_idx` — GIN with gin_trgm_ops for fuzzy LIKE.
- `people_data_gin`, `companies_data_gin` — GIN(jsonb_path_ops) for `@>` / `?` queries on dynamic fields.
- `enrichments_provider_idx` — `(provider, created_at desc)` for provider-scoped cost analytics.

## Ownership matrix
| Table | Write path |
|---|---|
| `organizations`, `memberships` | `bootstrap_user_org()` RPC on first login |
| `clients` | UI via Server Action |
| `people`, `companies`, `emails` | Worker Edge Function (service role) only |
| `audiences`, `campaigns` | UI + campaign wizard |
| `people_in_campaign`, `message_sequences` | Worker + UI |
| `enrichments`, `cost_tracking` | Worker + webhook handlers |
| `analytics_snapshots` | `instantly-sync` Edge Function |
| `replies` | `webhooks-instantly` Edge Function |
| `webhooks_log` | All webhook handlers |
