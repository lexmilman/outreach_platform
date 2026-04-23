import type { ApiError, NetworkError, RateLimitError, ValidationError } from "./http";

export type IntegrationOk<T> = {
  ok: true;
  data: T;
  costUsd: number;
  provider: string;
  latencyMs: number;
  meta?: Record<string, unknown>;
};

export type IntegrationErr = {
  ok: false;
  error: ApiError | RateLimitError | NetworkError | ValidationError;
};

export type IntegrationResult<T> = IntegrationOk<T> | IntegrationErr;
