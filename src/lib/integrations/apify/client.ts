import "server-only";
import { serverEnv } from "@/lib/env.server";
import { APIFY_ACTORS, type ApifyActorKey } from "./actors";
import {
  ApifyRunSchema,
  type ApifyPersonItem,
  type ApifyCompanyItem,
  type ApifyPostItem,
} from "./schemas";
import { fetchWithRetry, ValidationError } from "../_shared/http";
import type { IntegrationResult } from "../_shared/result";

const BASE = "https://api.apify.com/v2";

// TODO(Sprint 3): full implementation. This stub keeps the types consistent
// and returns ValidationError when called without a token so the worker handler
// can fail loudly instead of silently.

export async function startActorRun(input: {
  actor: ApifyActorKey;
  body: Record<string, unknown>;
  webhookUrl?: string;
  webhookSecret?: string;
}): Promise<IntegrationResult<{ runId: string; datasetId: string; actor: string }>> {
  const env = serverEnv();
  if (!env.APIFY_TOKEN) {
    return {
      ok: false,
      error: new ValidationError("APIFY_TOKEN is not set", "apify", null),
    };
  }

  const actorId = APIFY_ACTORS[input.actor];
  const qs = new URLSearchParams({ token: env.APIFY_TOKEN });
  if (input.webhookUrl) {
    const webhooks = [
      {
        eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED"],
        requestUrl: input.webhookUrl,
        payloadTemplate: undefined,
      },
    ];
    qs.set("webhooks", Buffer.from(JSON.stringify(webhooks)).toString("base64"));
  }

  const started = Date.now();
  const res = await fetchWithRetry(`${BASE}/acts/${encodeURIComponent(actorId)}/runs?${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.body),
  }, { provider: "apify" });

  const json = (await res.json()) as { data: unknown };
  const parsed = ApifyRunSchema.safeParse(json.data);
  if (!parsed.success) {
    return {
      ok: false,
      error: new ValidationError("Apify run response failed validation", "apify", parsed.error.issues),
    };
  }

  return {
    ok: true,
    data: { runId: parsed.data.id, datasetId: parsed.data.defaultDatasetId, actor: actorId },
    costUsd: 0, // finalized when webhook or polling returns usageTotalUsd
    provider: "apify",
    latencyMs: Date.now() - started,
  };
}

// Re-export types for ergonomics.
export type { ApifyPersonItem, ApifyCompanyItem, ApifyPostItem };
