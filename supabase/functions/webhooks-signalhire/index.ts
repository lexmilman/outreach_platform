// @ts-nocheck
// Supabase Edge Function: webhooks-signalhire
// Deploy with --no-verify-jwt.
//
// Flow:
//   1) Verify ?secret=<SIGNALHIRE_CALLBACK_SECRET>.
//   2) Body must be an array of result items.
//   3) Look up the pending request by request_id (header `request-id`).
//      We do NOT trust org_id from URL — single source of truth is
//      signalhire_pending_requests.
//   4) For each item: call signalhire_finalize_item RPC, enqueue
//      verify_email_instantly when an email was found.
//   5) Mark the pending request completed/failed.

import { createAdminClient } from "../_shared/supabase-admin.ts";

const SIGNALHIRE_USD_PER_CREDIT = 0.1;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const expected = Deno.env.get("SIGNALHIRE_CALLBACK_SECRET") ?? "";
  const secret = url.searchParams.get("secret") ?? "";
  if (!expected || secret !== expected) {
    return new Response("forbidden", { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  if (!Array.isArray(payload)) return new Response("bad request", { status: 400 });

  const requestId = req.headers.get("request-id") ?? "";
  if (!requestId) return new Response("missing request-id header", { status: 400 });

  const supabase = createAdminClient();

  const { error: dedupErr } = await supabase
    .from("webhooks_log")
    .insert({ provider: "signalhire", event_id: requestId, payload });
  if (dedupErr) {
    if (dedupErr.code === "23505") {
      return new Response(JSON.stringify({ ok: true, dup: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    console.error("webhooks_log insert", dedupErr);
  }

  // @ts-expect-error — Edge Runtime global
  EdgeRuntime.waitUntil(processSignalHireCallback(supabase, requestId, payload));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

type SignalHireItem = {
  item: string;
  status: string;
  candidate?: {
    fullName?: string;
    emails?: { value: string; type?: string }[];
    linkedinUrl?: string;
  } | null;
};

async function processSignalHireCallback(
  supabase: ReturnType<typeof createAdminClient>,
  requestId: string,
  items: SignalHireItem[],
) {
  const { data: pending, error } = await supabase
    .from("signalhire_pending_requests")
    .select("request_id, org_id, items, status")
    .eq("request_id", requestId)
    .maybeSingle();

  if (error || !pending) {
    console.warn(`signalhire orphan callback for request ${requestId}`, error?.message);
    return;
  }

  const enrichmentId = (pending.items as { enrichment_id?: number }).enrichment_id;
  if (!enrichmentId) {
    console.error("signalhire pending request missing enrichment_id", requestId);
    return;
  }

  const item = items[0];
  if (!item) {
    await supabase
      .from("enrichments")
      .update({ outcome: "miss", error_code: "empty_callback" })
      .eq("id", enrichmentId);
    await supabase
      .from("signalhire_pending_requests")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("request_id", requestId);
    return;
  }

  const cost = item.status === "success" ? SIGNALHIRE_USD_PER_CREDIT : 0;
  const emails = (item.candidate?.emails ?? []).map((e) => ({ value: e.value, type: e.type }));

  const { data: emailId } = await supabase.rpc("signalhire_finalize_item", {
    p_enrichment_id: enrichmentId,
    p_status: item.status,
    p_emails: emails,
    p_run_cost_usd: cost,
  });

  if (emailId) {
    await supabase.rpc("pgmq_send", {
      queue_name: "jobs",
      msg: {
        type: "verify_email_instantly",
        payload: { emailId },
        org_id: pending.org_id,
        job_id: crypto.randomUUID(),
      },
    });
  }

  await supabase
    .from("signalhire_pending_requests")
    .update({
      status: emailId ? "completed" : "failed",
      completed_at: new Date().toISOString(),
    })
    .eq("request_id", requestId);
}
