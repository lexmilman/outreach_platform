import "server-only";
import { serverEnv } from "@/lib/env.server";
import { ValidationError, fetchWithRetry } from "../_shared/http";
import type { IntegrationResult } from "../_shared/result";
import { SignalHireAcceptedSchema } from "./schemas";

const BASE = "https://www.signalhire.com/api/v1";

export async function submitCandidateSearch(input: {
  items: string[];
  callbackUrl: string;
}): Promise<IntegrationResult<{ requestId: string }>> {
  const env = serverEnv();
  if (!env.SIGNALHIRE_API_KEY) {
    return {
      ok: false,
      error: new ValidationError("SIGNALHIRE_API_KEY not set", "signalhire", null),
    };
  }

  const started = Date.now();
  const res = await fetchWithRetry(`${BASE}/candidate/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SIGNALHIRE_API_KEY,
    },
    body: JSON.stringify({ items: input.items, callbackUrl: input.callbackUrl }),
  }, { provider: "signalhire" });

  const json = await res.json();
  const parsed = SignalHireAcceptedSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: new ValidationError("SignalHire submit shape changed", "signalhire", parsed.error.issues),
    };
  }

  return {
    ok: true,
    data: { requestId: parsed.data.requestId },
    costUsd: 0,
    provider: "signalhire",
    latencyMs: Date.now() - started,
  };
}
