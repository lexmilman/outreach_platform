// Shared cost-recording helper for Edge Functions.
// Writes one row to `enrichments` and one rollup row to `cost_tracking`.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.46.2";

type RecordCostInput = {
  orgId: string;
  clientId?: string | null;
  campaignId?: string | null;
  personId?: string | null;
  companyId?: string | null;
  provider: string;
  endpoint: string;
  outcome: "hit" | "miss" | "error" | "pending";
  usdCost: number;
  units?: number;
  unitType?: "credit" | "call" | "token-input" | "token-output" | "result";
  creditsUsed?: number;
  emailReturned?: string | null;
  verificationStatus?: string | null;
  providerRequestId?: string | null;
  latencyMs?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  requestPayload?: unknown;
  responsePayload?: unknown;
};

export async function recordCost(supabase: SupabaseClient, input: RecordCostInput) {
  const { error: e1 } = await supabase.from("enrichments").insert({
    org_id: input.orgId,
    person_id: input.personId ?? null,
    company_id: input.companyId ?? null,
    campaign_id: input.campaignId ?? null,
    provider: input.provider,
    endpoint: input.endpoint,
    outcome: input.outcome,
    usd_cost: input.usdCost,
    credits_used: input.creditsUsed ?? null,
    email_returned: input.emailReturned ?? null,
    verification_status: input.verificationStatus ?? null,
    provider_request_id: input.providerRequestId ?? null,
    latency_ms: input.latencyMs ?? null,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
    request_payload: input.requestPayload ?? null,
    response_payload: input.responsePayload ?? null,
  });
  if (e1) console.error("enrichments insert failed", e1);

  if (input.usdCost > 0) {
    const { error: e2 } = await supabase.from("cost_tracking").insert({
      org_id: input.orgId,
      client_id: input.clientId ?? null,
      campaign_id: input.campaignId ?? null,
      provider: input.provider,
      usd_cost: input.usdCost,
      units: input.units ?? null,
      unit_type: input.unitType ?? null,
      ref_id: input.providerRequestId ?? null,
    });
    if (e2) console.error("cost_tracking insert failed", e2);
  }
}
