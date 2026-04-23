import "server-only";
import { serverEnv } from "@/lib/env.server";
import { ValidationError, fetchWithRetry } from "../_shared/http";
import type { IntegrationResult } from "../_shared/result";
import {
  InstantlyBulkAddRequestSchema,
  InstantlyAnalyticsOverviewSchema,
  type InstantlyLeadAddItem,
} from "./schemas";

const BASE = "https://api.instantly.ai";

export async function bulkAddLeads(input: {
  campaignId: string;
  leads: InstantlyLeadAddItem[];
}): Promise<IntegrationResult<{ added: number }>> {
  const env = serverEnv();
  if (!env.INSTANTLY_API_KEY) {
    return {
      ok: false,
      error: new ValidationError("INSTANTLY_API_KEY not set", "instantly", null),
    };
  }

  const body = { campaign_id: input.campaignId, leads: input.leads };
  const valid = InstantlyBulkAddRequestSchema.safeParse(body);
  if (!valid.success) {
    return {
      ok: false,
      error: new ValidationError("Instantly bulk add payload invalid", "instantly", valid.error.issues),
    };
  }

  const started = Date.now();
  const res = await fetchWithRetry(`${BASE}/api/v2/leads/add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.INSTANTLY_API_KEY}`,
    },
    body: JSON.stringify(body),
  }, { provider: "instantly" });

  const json = (await res.json()) as { added?: number };
  return {
    ok: true,
    data: { added: json.added ?? input.leads.length },
    costUsd: 0,
    provider: "instantly",
    latencyMs: Date.now() - started,
  };
}

export async function getCampaignAnalyticsOverview(
  campaignId: string,
): Promise<IntegrationResult<ReturnType<typeof InstantlyAnalyticsOverviewSchema.parse>>> {
  const env = serverEnv();
  if (!env.INSTANTLY_API_KEY) {
    return {
      ok: false,
      error: new ValidationError("INSTANTLY_API_KEY not set", "instantly", null),
    };
  }

  const started = Date.now();
  const res = await fetchWithRetry(
    `${BASE}/api/v2/campaigns/analytics/overview?id=${encodeURIComponent(campaignId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${env.INSTANTLY_API_KEY}` },
    },
    { provider: "instantly" },
  );

  const json = await res.json();
  const parsed = InstantlyAnalyticsOverviewSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: new ValidationError("Instantly analytics shape changed", "instantly", parsed.error.issues),
    };
  }

  return {
    ok: true,
    data: parsed.data,
    costUsd: 0,
    provider: "instantly",
    latencyMs: Date.now() - started,
  };
}
