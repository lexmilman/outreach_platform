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

// Instantly verify costs ~0.25 credits; rate is per-org configurable.
export const INSTANTLY_VERIFY_USD_PER_CALL = 0.0025;

function isMock(env = serverEnv()): boolean {
  return env.MOCK_INSTANTLY === "1" || !env.INSTANTLY_API_KEY;
}

export async function verifyEmail(
  email: string,
): Promise<IntegrationResult<{ status: string; isValid: boolean }>> {
  const env = serverEnv();
  if (isMock(env)) {
    return {
      ok: true,
      data: { status: "valid", isValid: true },
      costUsd: 0,
      provider: "instantly",
      latencyMs: 0,
      meta: { mock: true },
    };
  }

  const started = Date.now();
  const res = await fetchWithRetry(
    `${BASE}/api/v2/email-verification`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.INSTANTLY_API_KEY}`,
      },
      body: JSON.stringify({ email }),
    },
    { provider: "instantly" },
  );
  const json = (await res.json()) as { verification_status?: string };
  const status = json.verification_status ?? "unknown";
  const isValid = status === "valid" || status === "accept_all";
  return {
    ok: true,
    data: { status, isValid },
    costUsd: INSTANTLY_VERIFY_USD_PER_CALL,
    provider: "instantly",
    latencyMs: Date.now() - started,
  };
}

export async function bulkAddLeads(input: {
  campaignId: string;
  leads: InstantlyLeadAddItem[];
}): Promise<IntegrationResult<{ added: number }>> {
  const env = serverEnv();
  if (isMock(env)) {
    return {
      ok: true,
      data: { added: input.leads.length },
      costUsd: 0,
      provider: "instantly",
      latencyMs: 0,
      meta: { mock: true },
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
  if (isMock(env)) {
    return {
      ok: true,
      data: {
        campaign_id: campaignId,
        sent: 0,
        opened: 0,
        replied: 0,
        bounced: 0,
        unsubscribed: 0,
        clicked: 0,
        completed: 0,
        total_interested: 0,
        total_meeting_booked: 0,
        positive_replied: 0,
      },
      costUsd: 0,
      provider: "instantly",
      latencyMs: 0,
      meta: { mock: true },
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
