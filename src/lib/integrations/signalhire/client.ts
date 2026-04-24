import "server-only";
import { serverEnv } from "@/lib/env.server";
import { ValidationError, fetchWithRetry } from "../_shared/http";
import type { IntegrationResult } from "../_shared/result";
import { SignalHireAcceptedSchema } from "./schemas";

const BASE = "https://www.signalhire.com/api/v1";

// SignalHire bills credits per successful candidate. Plan rate is per-org
// configurable in api_integrations_config.config.usd_per_credit.
export const SIGNALHIRE_DEFAULT_USD_PER_CREDIT = 0.1;

function isMock(env = serverEnv()): boolean {
  return env.MOCK_SIGNALHIRE === "1" || !env.SIGNALHIRE_API_KEY;
}

export async function submitCandidateSearch(input: {
  items: string[];
  callbackUrl: string;
}): Promise<IntegrationResult<{ requestId: string }>> {
  const env = serverEnv();
  if (isMock(env)) {
    return {
      ok: true,
      data: { requestId: `mock_req_${Date.now()}` },
      costUsd: 0,
      provider: "signalhire",
      latencyMs: 0,
      meta: { mock: true },
    };
  }

  const started = Date.now();
  const res = await fetchWithRetry(
    `${BASE}/candidate/search`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SIGNALHIRE_API_KEY!,
      },
      body: JSON.stringify({ items: input.items, callbackUrl: input.callbackUrl }),
    },
    { provider: "signalhire" },
  );
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
    costUsd: 0, // billed when results arrive in the callback
    provider: "signalhire",
    latencyMs: Date.now() - started,
  };
}
