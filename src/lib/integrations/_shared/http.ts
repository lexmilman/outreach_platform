/**
 * Shared HTTP helper for every integration client.
 *
 * Rules (see .claude/rules/integrations.md):
 *  - Retry only 429 + 5xx, respect Retry-After.
 *  - Max 5 attempts. Base 500ms, factor 2, jitter 0-200ms.
 *  - Never throw raw fetch errors — wrap in typed errors so callers branch on `.ok`.
 *  - Every caller is responsible for recording cost via `recordCost(...)` once per call.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
    public provider: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class RateLimitError extends ApiError {
  constructor(body: unknown, provider: string, public retryAfterSec: number) {
    super(`Rate limited by ${provider}`, 429, body, provider);
    this.name = "RateLimitError";
  }
}

export class NetworkError extends Error {
  constructor(message: string, public provider: string, public cause?: unknown) {
    super(message);
    this.name = "NetworkError";
  }
}

export class ValidationError extends Error {
  constructor(message: string, public provider: string, public issues: unknown) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface FetchWithRetryOptions {
  provider: string;
  retries?: number;
  baseDelayMs?: number;
  factor?: number;
  maxDelayMs?: number;
  respectRetryAfter?: boolean;
  signal?: AbortSignal;
}

const DEFAULT_OPTS: Required<Omit<FetchWithRetryOptions, "provider" | "signal">> = {
  retries: 5,
  baseDelayMs: 500,
  factor: 2,
  maxDelayMs: 30_000,
  respectRetryAfter: true,
};

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: FetchWithRetryOptions,
): Promise<Response> {
  const config = { ...DEFAULT_OPTS, ...opts };
  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= config.retries) {
    const started = Date.now();
    try {
      const res = await fetch(url, { ...init, signal: opts.signal });
      if (res.ok) return res;

      // Retry on 429 + 5xx
      if (res.status === 429 || res.status >= 500) {
        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfter =
          config.respectRetryAfter && retryAfterHeader
            ? Math.max(0, Math.min(config.maxDelayMs / 1000, Number(retryAfterHeader) || 0))
            : null;

        if (attempt === config.retries) {
          const body = await safeJson(res);
          if (res.status === 429) {
            throw new RateLimitError(body, opts.provider, retryAfter ?? 60);
          }
          throw new ApiError(`Upstream ${res.status}`, res.status, body, opts.provider);
        }

        const delay =
          retryAfter != null
            ? retryAfter * 1000
            : Math.min(
                config.maxDelayMs,
                config.baseDelayMs * Math.pow(config.factor, attempt) + jitter(),
              );
        await sleep(delay);
        attempt++;
        continue;
      }

      // Non-retriable — surface as ApiError.
      const body = await safeJson(res);
      throw new ApiError(`Upstream ${res.status}`, res.status, body, opts.provider);
    } catch (err) {
      if (err instanceof ApiError || err instanceof RateLimitError) throw err;
      lastErr = err;
      if (attempt === config.retries) {
        throw new NetworkError(
          `Network error calling ${opts.provider}`,
          opts.provider,
          err,
        );
      }
      await sleep(
        Math.min(config.maxDelayMs, config.baseDelayMs * Math.pow(config.factor, attempt) + jitter()),
      );
      attempt++;
    } finally {
      void started; // reserved for latency logging hooks
    }
  }
  throw new NetworkError("Exhausted retries", opts.provider, lastErr);
}

function jitter() {
  return Math.floor(Math.random() * 200);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    try {
      return await res.text();
    } catch {
      return null;
    }
  }
}
