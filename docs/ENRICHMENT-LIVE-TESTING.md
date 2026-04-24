# Plan: live-API enrichment verification (Sprint 3)

Goal: prove every Sprint 3 enrichment path works against real provider
APIs — not MSW, not fixtures — before we let a 100-lead batch loose.

Today Sprint 3 is covered by unit tests + a contract-shape scenario
(`src/lib/integrations/_scenarios/email-waterfall.test.ts`) that still
runs through MSW. That catches "our code is internally consistent" but
NOT "the provider still returns what we think it does". This plan adds
a second test tier that hits real APIs on demand, and a third tier that
exercises the full worker → Supabase → DB chain.

Reference: `docs/ENRICHMENT-GO-LIVE.md` phase 5 already walks through
a manual live-go sequence. This plan codifies that into repeatable,
guarded tests so we don't have to remember the SQL next time.

---

## What we're verifying

Sprint 3 handlers (from `supabase/functions/worker/index.ts:147-180`):

| Job type | Provider | Shape |
|---|---|---|
| `enrich_person_apify` | Apify `dev_fusion~linkedin-profile-scraper` | async (webhook) |
| `enrich_company_apify` | Apify `dev_fusion~linkedin-company-scraper` | async (webhook) |
| `scrape_posts_apify` | Apify `harvestapi~linkedin-profile-posts` | async (webhook) |
| `find_email_findymail` | FindyMail `/api/search/linkedin` | sync |
| `find_email_signalhire` | SignalHire `/api/v1/candidate/search` | async (webhook) |
| `verify_email_instantly` | Instantly `/api/v2/email-verification` | sync |
| `score_lead_llm` | Anthropic Claude (no mock) | sync |
| `generate_messages_llm` | Anthropic Claude (auto-chained when score ≥ 70) | sync |
| `enrich_custom_perplexity` | Perplexity `sonar-pro` | sync |

Failure modes we want to catch:

1. **Contract drift** — provider silently changed a field (the zod
   `ValidationError` path). FindyMail, SignalHire, Apify and Perplexity
   have all done this before.
2. **Credit / auth failures** — live key is invalid, plan is out of
   credits, or IP-restricted.
3. **Worker chain breakage** — apify run starts, but the webhook never
   reaches `webhooks-apify`, or `enrichments.outcome` never flips.
4. **DB finalize regressions** — handler succeeds but the RPC that
   merges into `people.data_json` / `emails` / `people_in_campaign`
   was renamed or changed signature.

---

## Tier 1 — client-level live tests (Vitest, opt-in)

**File**: `src/lib/integrations/_scenarios/live-apis.test.ts`

**Run command**: `LIVE_APIS=1 pnpm vitest run src/lib/integrations/_scenarios/live-apis.test.ts`

Purpose: catch provider-contract drift cheaply. Hits each real HTTP
endpoint once with a known test input and asserts the zod parse
succeeds. No DB, no worker.

Guard pattern (every case in the file):

```ts
const LIVE = process.env.LIVE_APIS === "1";
describe.skipIf(!LIVE)("live: <provider>", () => { ... });
```

Because `test/setup.ts` registers MSW with
`onUnhandledRequest: "error"`, the live file MUST bypass MSW. Two
options — pick one, I recommend (b):

(a) Add a second Vitest project in `vitest.config.ts` with a separate
    `setupFiles` that does NOT mount MSW.
(b) Inside the live test, call `server.close()` in a `beforeAll` guarded
    by `LIVE_APIS === "1"`, and `server.listen()` again in `afterAll`.
    Cheaper to add, no config churn.

Cases (each is `it.skipIf(!LIVE)`):

1. **Apify start+poll** — `startActorRun({ actor:"personProfile", body:{ profileUrls:["https://linkedin.com/in/anthropic"] } })`, poll `getRun` every 5 s up to 120 s, then `getDatasetItems`. Assert: `fm.ok === true`, dataset has ≥ 1 item, zod parse passes. Cost ≈ $0.01. Do NOT pass a `webhookUrl` — we only need the poll path here.
2. **FindyMail** — `findEmailByLinkedin("https://linkedin.com/in/williamhgates")`. Assert: `.ok === true`, either `data === null` or `data.email` matches `/\S+@\S+\.\S+/`. Cost $0 or $0.015.
3. **FindyMail by name+domain** — `findEmailByName({firstName:"Satya", lastName:"Nadella", domain:"microsoft.com"})`. Same assertions.
4. **SignalHire submit** — `submitCandidateSearch({ items:["https://linkedin.com/in/williamhgates"], callbackUrl:"https://example.com/cb?secret=test" })`. Assert: `ok === true`, `data.requestId` matches `/^[a-z0-9_-]+$/i`. We can't test the callback here without a public URL — that's tier 3.
5. **Instantly verify** — `verifyEmail("bill.g@example.com")`. Assert: `.ok`, `data.status` in a known set (`valid | invalid | accept_all | unknown | risky | ...`). Cost $0.0025.
6. **Perplexity** — `chat({ model:"sonar-pro", prompt:"One-sentence summary of what Anthropic does." })`. Assert: `.ok`, `data.content.length > 20`, `citations` is an array.
7. **Anthropic (score shape)** — `callLLM({ provider:"anthropic", model:"claude-haiku-4-5", schema: ScoreOutputSchema, prompt: "<one-line stub lead>" })`. Haiku matches what `score_lead_llm` uses in production. Assert: `result.data` parses, `usage.input > 0`, `costUsd > 0`. We deliberately do NOT call `generate_messages_llm`'s sonnet model here — that's exercised end-to-end in tier 3 when score ≥ 70.

Each case logs `{provider, latencyMs, costUsd, inputCount:1, outputCount:<n>}` via `logger.info` per CLAUDE.md drift-detection rule.

Budget envelope per full tier-1 run: ~$0.04. Safe to run daily.

---

## Tier 2 — waterfall scenario against real APIs

**File**: extend `src/lib/integrations/_scenarios/email-waterfall.test.ts`
with a second `describe.skipIf(!LIVE)` block.

We already have the mocked-contract version. The live version runs the
same two scripts back-to-back but against real FindyMail / Instantly
(SignalHire stays submit-only because we can't round-trip its webhook
from a unit-test process):

- **Happy path** — pick a LinkedIn URL we know FindyMail resolves
  (`williamhgates`). Expect FindyMail HIT → Instantly verify returns a
  known-good status. Assert `email` matches `/@microsoft\.com$/` or the
  lead's real domain.
- **Miss path** — pick a URL we know FindyMail does NOT resolve (a
  private or low-signal profile; we'll keep a short hand-curated list in
  `test/fixtures/live-leads.json`). Expect FindyMail miss → SignalHire
  submit returns a `requestId`. Stop there.

Keep the curated live-leads list under git — 5–10 public figures with
stable profiles. Avoid our own paying customers' profiles.

---

## Tier 3 — end-to-end worker + DB smoke (Playwright, opt-in)

**File**: replace the `.fixme()` in `e2e/enrichment-run.spec.ts` with a
real spec guarded by `process.env.LIVE_ENRICHMENT === "1"`.

This is the only tier that actually exercises the Supabase Edge
Function worker + the finalize RPCs + the `/people` UI. It's the one
we run before each go-live.

Prereqs:

- `TEST_SUPABASE_*` env vars point at the dedicated test project
  (separate from production, as per `docs/ENRICHMENT-GO-LIVE.md`).
- On that project: all `MOCK_*` flags DELETED from Edge Function
  Secrets, real provider keys SET, cron job `worker-tick` running.
- A seeded test org + test client + test lead (see "Fixtures" below).

Flow:

1. `beforeAll`: via service-role client, seed a fresh test lead:
   - `people` row with a known public LinkedIn URL that we know
     FindyMail resolves
   - `people_in_campaign` row linking it to a seeded campaign
   - Delete any prior `enrichments` / `emails` rows for that person
     (idempotency).
2. Log in as the test operator, navigate to `/people?clientId=<test>`.
3. Click **Run on next N people** with N = 1.
4. Poll `/jobs` via server-side query every 3 s up to 5 min until the
   chain for that person has `enrich_person_apify` → succeeded,
   `enrich_company_apify` → succeeded, `find_email_findymail` →
   succeeded, `verify_email_instantly` → succeeded, `score_lead_llm` →
   succeeded. If score ≥ 70, also wait for `generate_messages_llm`.
5. Assert DB state. Each of these is the visible side-effect of a
   finalize RPC — failing one tells us exactly which handler broke:
   - `apify_finalize_person` → `people.data_json ? 'apify'` true, `data_json->'apify'->>'headline'` non-empty
   - `apify_finalize_company` → `companies.data_json ? 'apify'` true for the linked company
   - `findymail_finalize` (or `signalhire_finalize_item`) → `emails` has ≥ 1 row for the person
   - `instantly_verify_finalize` → that `emails` row has `verification_status` set
   - `score_lead_finalize` → `people_in_campaign.relevance_score` is a number 0-100 and `.relevance_reasons` is an array
   - `generate_messages_finalize` (only if score ≥ 70) → `message_sequences` has a row for that PIC with 4 bodies + a subject
6. `afterAll`: delete the test lead's enrichments + emails + PIC rows so
   next run is clean. Don't delete the `people` row — Apify credit is
   spent, we'd rather reuse the data_json.

Expected cost per run: ~$0.05 (one full waterfall).

Separate, smaller Playwright spec **`e2e/enrichment-perplexity.spec.ts`**
runs only `enrich_custom_perplexity` (no auto-chain, so it's cheap and
independent). Seeds a person, enqueues the job via the
`enqueueCustomResearchAction` server action, waits for completion,
asserts `people.data_json ? 'perplexity'` and that at least one
citation URL landed in `data_json->'perplexity'->'citations'`.

---

## Fixtures — `test/fixtures/live-leads.json`

Keep a short, stable, public-figure-only list. Never real customer leads.

```json
{
  "findymail_hit": {
    "linkedin_url": "https://www.linkedin.com/in/williamhgates",
    "first_name": "Bill",
    "last_name": "Gates",
    "domain": "gatesfoundation.org"
  },
  "findymail_miss": {
    "linkedin_url": "https://www.linkedin.com/in/<curated-low-signal-profile>",
    "first_name": "...",
    "last_name": "...",
    "domain": "..."
  },
  "apify_profile": {
    "linkedin_url": "https://www.linkedin.com/in/anthropic"
  }
}
```

We may need to rotate the `findymail_miss` entry every few months as
FindyMail's index grows. Treat a changed result as a DATA change, not a
test failure — update the fixture.

---

## Package scripts

Add to `package.json`:

```jsonc
"test:live": "LIVE_APIS=1 vitest run src/lib/integrations/_scenarios",
"test:e2e:live": "LIVE_ENRICHMENT=1 playwright test e2e/enrichment-run.spec.ts e2e/enrichment-perplexity.spec.ts"
```

Neither runs in the default `pnpm test` or in CI. Operator runs them
manually from the local machine when doing a go-live check.

---

## CI posture

- Default `pnpm test` still uses MSW. No change. No provider keys in CI.
- A new nightly GitHub Actions workflow **optional, not part of this
  plan's first delivery** — can run `test:live` once a day against real
  APIs with secrets from GH repo secrets. Budget ~$1/month. Flag as a
  follow-up ticket, don't build yet.

---

## What I need from the operator to implement this

Before I write the code:

1. Confirm the "bypass MSW in-place" approach (option b above) vs a
   separate vitest project.
2. Confirm we're OK using Bill Gates' public LinkedIn as the
   known-hit fixture, or give me another stable public figure.
3. The test Supabase project from `docs/ENRICHMENT-GO-LIVE.md` —
   is it already provisioned, and do we have `TEST_SUPABASE_*` vars
   set on the local machine?
4. Budget cap per test run (I've estimated $0.04 for tier 1 and $0.05
   per tier-3 run; say stop if you'd rather cap lower).

Once those are answered I'll build tier 1 first (cheapest, highest
signal for contract drift), get it green, then tier 2, then tier 3.

## Order of work (once approved)

1. Add `test/fixtures/live-leads.json` with 2-3 public-figure entries.
2. Add `src/lib/integrations/_scenarios/live-apis.test.ts` with the 7
   client-level cases, MSW bypass helper, all `skipIf(!LIVE_APIS)`.
3. Add `test:live` npm script. Run locally, fix any zod drift surfaced.
4. Extend `email-waterfall.test.ts` with the 2 live cases.
5. Flip `e2e/enrichment-run.spec.ts` off `.fixme()`, behind
   `LIVE_ENRICHMENT`, with seed + poll + assert + cleanup.
6. Add `e2e/enrichment-perplexity.spec.ts`.
7. Add `test:e2e:live` npm script.
8. Update `docs/ENRICHMENT-GO-LIVE.md` phase 5 to point at the new
   scripts instead of the manual SQL steps.

Each step is a separate commit on the production branch via `/ship`.
