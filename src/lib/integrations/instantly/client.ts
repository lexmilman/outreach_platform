import "server-only";
import { serverEnv } from "@/lib/env.server";
import { ValidationError, fetchWithRetry } from "../_shared/http";
import type { IntegrationResult } from "../_shared/result";
import {
  InstantlyBulkAddRequestSchema,
  InstantlyAnalyticsOverviewSchema,
  InstantlyCampaignCreateRequestSchema,
  InstantlyCampaignCreateResponseSchema,
  type InstantlyCampaignCreateRequest,
  type InstantlyLeadAddItem,
  type InstantlySequenceStep,
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

export async function createCampaign(
  input: InstantlyCampaignCreateRequest,
): Promise<IntegrationResult<{ campaignId: string; raw: unknown }>> {
  const env = serverEnv();
  const valid = InstantlyCampaignCreateRequestSchema.safeParse(input);
  if (!valid.success) {
    return {
      ok: false,
      error: new ValidationError("Instantly campaign payload invalid", "instantly", valid.error.issues),
    };
  }

  if (isMock(env)) {
    const mockId = `mock_camp_${Math.random().toString(36).slice(2, 10)}`;
    return {
      ok: true,
      data: { campaignId: mockId, raw: { id: mockId, name: input.name, status: "draft" } },
      costUsd: 0,
      provider: "instantly",
      latencyMs: 0,
      meta: { mock: true },
    };
  }

  const started = Date.now();
  const res = await fetchWithRetry(
    `${BASE}/api/v2/campaigns`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.INSTANTLY_API_KEY}`,
      },
      body: JSON.stringify(valid.data),
    },
    { provider: "instantly" },
  );

  const json = await res.json();
  const parsed = InstantlyCampaignCreateResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: new ValidationError("Instantly campaign response shape changed", "instantly", parsed.error.issues),
    };
  }

  return {
    ok: true,
    data: { campaignId: parsed.data.id, raw: parsed.data },
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

// --- Template substitution helpers ---------------------------------------
// Sequence templates hold {{placeholder}} tokens (e.g. {{email_copy_1}}).
// When pushing leads, the worker renders a per-campaign sequence by filling
// those tokens with the generated message_sequences row for the lead.
// For *creation* of a campaign we upload the template as-is: Instantly keeps
// the {{placeholder}} tokens and maps them to custom_variables at send time.

export function renderSequenceStep(
  step: InstantlySequenceStep,
  tokens: Record<string, string | null | undefined>,
): InstantlySequenceStep {
  return {
    step: step.step,
    delay_days: step.delay_days,
    subject: substitute(step.subject, tokens),
    body: substitute(step.body, tokens),
  };
}

function substitute(template: string, tokens: Record<string, string | null | undefined>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => {
    const v = tokens[key];
    return v == null ? "" : String(v);
  });
}
