# Integration rules

## Shape
Every external provider lives in `src/lib/integrations/<provider>/`:
- `client.ts` — typed HTTP client with retries, cost accounting, and mock mode.
- `schemas.ts` — zod schemas for request/response bodies.
- (optional) `actors.ts`, `webhook-verify.ts`.

## Client contract
Every client export must return a discriminated union:
```ts
type Result<T> =
  | { ok: true; data: T; costUsd: number; provider: string; latencyMs: number }
  | { ok: false; error: ApiError | RateLimitError | NetworkError | ValidationError };
```
Callers never throw — they branch on `.ok`.

## Retries
- Use `src/lib/integrations/_shared/http.ts` `fetchWithRetry` with exponential backoff.
- Respect `Retry-After` header.
- Retry on 429 and 5xx only. Never retry on 4xx other than 408/429.
- Max 5 attempts. Base delay 500ms, factor 2, jitter 0–200ms.

## Cost tracking
- Every call must call `recordCost({ provider, usd_cost, units, unit_type, ref_id })` once per API call.
- Derive USD from provider-specific rules:
  - Apify: `run.usageTotalUsd`
  - FindyMail: 1 credit × $0.015 (or per active plan — store plan rate in `api_integrations_config.config`)
  - SignalHire: credit × $0.10 (plan-dependent)
  - Instantly verify: 0.25 credits × credit rate
  - LLM: computed via `src/lib/ai/pricing.ts` `computeCost({ inputTokens, outputTokens, cachedTokens, provider, model })`

## Webhooks
- Every webhook Edge Function must:
  1. Verify signature/secret before parsing.
  2. Dedupe on `(provider, event_id)` via `webhooks_log` table.
  3. ACK with 200 within 5s — defer heavy work via `EdgeRuntime.waitUntil`.
  4. Parse payload through zod; reject unknown shapes with 400.

## Mock mode
Set `MOCK_<PROVIDER>=1` to load fixtures from `test/fixtures/<provider>/*.json` instead of hitting the API. Used during local dev without real keys.

## Forbidden
- No direct `fetch()` to third-party APIs outside `src/lib/integrations/`.
- No API keys in code or logs.
- No silent `catch (e) { return null }` — log the error with context.
