# Enrichment go-live runbook

One-time setup to turn on the live enrichment + messaging pipeline. After
this, pushing code to the production branch auto-deploys Edge Functions,
and the `/people` bulk-run button actually fires real API calls.

## Costs at a glance (so you know the damage)

| Provider | Per call | Triggered by |
|---|---|---|
| Apify — LinkedIn profile scrape | ~$0.01 / lead | `/people` "Run on next N" |
| Apify — LinkedIn company scrape | ~$0.008 / lead | chained after person enrichment |
| Apify — LinkedIn posts | ~$0.0015 / lead | optional, manual enqueue |
| FindyMail email finder | ~$0.015 / hit | tier 1 of the email waterfall |
| SignalHire candidate search | ~$0.10 / credit | tier 2 (only when findymail misses) |
| Instantly email verification | ~$0.0025 / call | after any email is found |
| Anthropic Claude Sonnet 4.6 | ~$0.001 / scoring call | auto-chained by `score_lead_llm` |
| Anthropic Claude Sonnet 4.6 | ~$0.005 / messages call | only when score ≥ 70 |
| Perplexity Sonar Pro | ~$0.01 / custom research | on-demand only |

Typical full cycle per lead (person + company + email + verify + score +
messages): **~$0.04-0.06**. A batch of 100 leads runs you ~$5.

---

## Phase 1 — GitHub secrets (one-time, 2 min)

These let GitHub Actions deploy Edge Functions on every push.

1. In **Supabase Dashboard** → click your account avatar (top-right) →
   **Access Tokens** → **Generate new token** (label it
   `github-actions-leadflow`, don't share). Copy the value.

2. In **Supabase Dashboard** → **Project Settings** → **General** →
   copy the **Reference ID** (looks like `abcdefgh1234567890`).

3. In **GitHub** → your repo → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret** twice:
   - Name `SUPABASE_ACCESS_TOKEN`, value = the token from step 1.
   - Name `SUPABASE_PROJECT_REF`, value = the reference id from step 2.

## Phase 2 — First deploy (5 min, 90 % automated)

Any push that touches `supabase/functions/**` on the production branch
triggers the workflow. The one that commits this runbook does.

1. **GitHub** → **Actions** tab → wait for **"Deploy Edge Functions"** run
   to finish. ~90 seconds.

2. If you want to retrigger manually: **Actions** → **Deploy Edge
   Functions** → **Run workflow** → pick the production branch → **Run**.

3. **Supabase Dashboard** → **Edge Functions** → verify 5 entries with
   green "Active": `worker`, `instantly-sync`, `webhooks-apify`,
   `webhooks-instantly`, `webhooks-signalhire`.

## Phase 3 — Apply pending migrations (1 min)

If a new Sprint migration hasn't been applied yet, paste the matching
`scripts/hotfix-*.sql` file into the **SQL Editor** and hit **Run**.
Files use `CREATE OR REPLACE` / `IF NOT EXISTS` so re-running is safe.
For the current MVP, apply any of these you haven't yet:

- `scripts/sprint3-migrations.sql` — migrations 8–12 (if not yet applied)
- `scripts/hotfix-bulk-upsert-v2.sql` — migration 14
- `scripts/hotfix-audience-members.sql` — migration 13
- `scripts/hotfix-sprint4.sql` — migration 15

## Phase 4 — First run in MOCK mode (no real API calls, no $ spent)

Purpose: prove the plumbing works end-to-end before letting any provider
bill you.

### 4a. Set MOCK flags

**Supabase Dashboard** → **Edge Functions** → **Secrets** tab (or
**Project Settings** → **Vault** depending on dashboard version) →
**New secret** for each of:

```
MOCK_APIFY       = 1
MOCK_FINDYMAIL   = 1
MOCK_SIGNALHIRE  = 1
MOCK_INSTANTLY   = 1
MOCK_PERPLEXITY  = 1
```

Also pre-generate and set the webhook-verification secrets (you'll need
them again in Phase 5, so save them somewhere):

```
APIFY_WEBHOOK_SECRET         = <random 32-char hex>
SIGNALHIRE_CALLBACK_SECRET   = <random 32-char hex>
INSTANTLY_WEBHOOK_SECRET     = <random 32-char hex>
```

To generate a value in your terminal: `openssl rand -hex 32`.
If no terminal handy: use https://www.random.org/strings/ — 32 chars,
alphanumeric, single string.

### 4b. Fire one enrichment

Open the production URL → **People** → click **Run on next N people**
with **N = 1**.

Toast should say "Queued 1 enrichment job(s)." You've now put an
`enrich_person_apify` message in the queue.

### 4c. Watch it succeed on /jobs

**Jobs** page → within 10–30 seconds you should see a row appear:
- type `enrich_person_apify`, status `running` → `succeeded`
- cost $0.00
- no error

If it stays `running` for > 2 minutes: cron may not be firing. Check
SQL: `select * from cron.job;` — should have a row scheduling worker
every 10s.

### 4d. Check the database got updated

In **SQL Editor**:

```sql
-- Should show at least one apify row tied to that person:
select provider, endpoint, outcome, response_payload
from public.enrichments
order by created_at desc
limit 5;

-- Person's data_json should now have an 'apify' key:
select full_name, data_json->'apify' as apify_data
from public.people
where data_json ? 'apify'
order by updated_at desc
limit 5;
```

If you see the fixture data, **MOCK works end-to-end**. Move on.

## Phase 5 — Go live, one provider at a time

Switch providers from MOCK to real API **in this order**. Test 1 lead,
then 10, then batch. Do NOT switch multiple providers at once.

### 5a. Apify (cheapest, safest first)

1. **Apify** → **Settings** → **Integrations** → copy the **Personal API
   token** (starts with `apify_api_`).
2. **Supabase Dashboard** → **Edge Functions** → **Secrets**:
   - **Delete** `MOCK_APIFY`
   - **Add** `APIFY_TOKEN = apify_api_xxxxxxxxxxxxxxxxxxx`
   - Confirm `APIFY_WEBHOOK_SECRET` is still set from 4a.
3. On `/people` click **Run on next 1 people** → watch `/jobs`:
   - `enrich_person_apify` should go `running` → (takes 30-90 s on real
     Apify) → eventually `succeeded` with cost ~$0.01.
   - A `find_email_findymail` job should appear right after (auto-chain).
4. SQL verification: `select full_name, data_json->'apify'->>'headline'
   from public.people where data_json ? 'apify';`

If it errors with `APIFY_TOKEN not set` you forgot to delete the MOCK
flag or didn't save the secret — retry.

### 5b. FindyMail (tier 1 email finder)

1. **FindyMail** → **Settings** → **API** → copy your key.
2. Secrets: delete `MOCK_FINDYMAIL`, add `FINDYMAIL_API_KEY = …`.
3. Fire an enrichment on a lead you haven't enriched yet. Watch
   `/jobs` for `find_email_findymail` → `succeeded` with cost ~$0.015
   when a hit, $0.00 when a miss.
4. SQL: `select * from public.emails order by created_at desc limit 5;`
   Should have rows with `source='findymail'`.

### 5c. SignalHire (tier 2, async via webhook)

This one's trickiest because SignalHire calls us back.

1. **SignalHire** → API settings → copy API key.
2. Secrets:
   - Delete `MOCK_SIGNALHIRE`
   - Add `SIGNALHIRE_API_KEY = …`
   - Confirm `SIGNALHIRE_CALLBACK_SECRET` is still set
3. Find a lead FindyMail missed and queue `find_email_signalhire` for
   it manually via SQL:
   ```sql
   select public.enqueue_job(
     'find_email_signalhire',
     jsonb_build_object('personId','<person-id>'),
     '<your-org-id>'
   );
   ```
4. `/jobs` should show `find_email_signalhire` → `succeeded` quickly
   (only the submit, not the result yet).
5. SignalHire will POST results back to
   `<SUPABASE_URL>/functions/v1/webhooks-signalhire?secret=<secret>`
   which happens automatically — no UI config needed.
6. Within a minute, `/jobs` should show a `verify_email_instantly` job
   (auto-chained from the webhook).
7. SQL: `select * from public.emails where source='signalhire';`

### 5d. Instantly email verification + campaign push

Instantly is used for two things: verify emails + push leads into
sequences. Both share the same API key; pushing also needs a webhook.

1. **Instantly** → **Settings** → **API** → copy key.
2. Secrets: delete `MOCK_INSTANTLY`, add `INSTANTLY_API_KEY = …`.
   `INSTANTLY_WEBHOOK_SECRET` should still be set.
3. **Instantly UI** → your workspace → **Integrations** → **Webhooks** →
   **Add webhook** pointing at
   `<SUPABASE_URL>/functions/v1/webhooks-instantly` with header
   `Authorization: Bearer <INSTANTLY_WEBHOOK_SECRET>`. Subscribe to:
   `reply_received`, `email_bounced`, `email_opened`, `lead_unsubscribed`,
   `lead_interested`.
4. Retry an enrichment with a real email — the `verify_email_instantly`
   step should populate `public.emails.verification_status`.

### 5e. Anthropic (LLM — no MOCK exists, so BE CAREFUL)

Scoring + message generation have no mock mode — they always hit the
API when the job runs. $0.001–$0.005 per call, but at 100 leads
scoring that's $0.10, messages maybe $0.50. Not catastrophic.

1. **Anthropic Console** → **API Keys** → create key.
2. Secrets: add `ANTHROPIC_API_KEY = sk-ant-…`.
3. To test: manually enqueue a score for ONE lead (requires a PIC —
   person in campaign — so you need a campaign with that person first):
   ```sql
   select public.enqueue_job(
     'score_lead_llm',
     jsonb_build_object('personInCampaignId','<pic-id>'),
     '<your-org-id>'
   );
   ```
4. Check `/jobs` → `score_lead_llm` → `succeeded`.
5. SQL: `select relevance_score, relevance_tier, relevance_reasons
   from public.people_in_campaign where id='<pic-id>';`
6. If score ≥ 70 a `generate_messages_llm` job will auto-run.

## Phase 6 — Batch go (optional)

Once 1 lead works end-to-end for every provider, remove remaining MOCK
flags, then try N = 10, watch costs and errors. Then 100. Real throughput
is ~1 lead / 30 seconds (Apify dominates), so 100 leads takes ~50 min.

## Rolling back

If anything misbehaves:

- **Re-enable MOCK for one provider**: add that `MOCK_*=1` secret back.
  Existing in-flight jobs finish with real data; new ones are mocked.
- **Pause all background work**: delete the cron job:
  `select cron.unschedule('worker-tick');` — no more jobs process until
  you re-schedule it (migration 4 has the command).
- **Wipe a runaway queue**: `select pgmq.purge_queue('jobs');`
- **Replay a DLQ entry** once fixed: click Replay on `/jobs`.

## Secrets checklist (for your own records)

After go-live, these should all be set in Supabase → Edge Functions → Secrets:

```
APIFY_TOKEN                    (live)
APIFY_WEBHOOK_SECRET           (random 32-byte hex)
FINDYMAIL_API_KEY              (live)
SIGNALHIRE_API_KEY             (live)
SIGNALHIRE_CALLBACK_SECRET     (random 32-byte hex)
INSTANTLY_API_KEY              (live)
INSTANTLY_WEBHOOK_SECRET       (random 32-byte hex)
ANTHROPIC_API_KEY              (live)
PERPLEXITY_API_KEY             (optional, only if using custom research)
```

No `MOCK_*` flags should remain. `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
are injected automatically — don't set them by hand.
