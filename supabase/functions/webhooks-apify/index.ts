// @ts-nocheck
// Supabase Edge Function: webhooks-apify
// Deploy with --no-verify-jwt.
//
// Flow on every Apify run lifecycle event we subscribe to (SUCCEEDED/FAILED/ABORTED):
//   1) Verify ?secret=<APIFY_WEBHOOK_SECRET>.
//   2) Dedupe on (provider='apify', event_id=resource.id) via webhooks_log.
//   3) Look up the pending enrichments row by provider_request_id = run.id.
//   4) On SUCCEEDED: fetch dataset items (limit 1k), call the matching
//      apify_finalize_* RPC, then enqueue the natural follow-up job.
//   5) On FAILED/ABORTED: mark enrichment outcome='error', no follow-up.

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { findActorKeyById, getDatasetItems } from "../_shared/apify.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const expected = Deno.env.get("APIFY_WEBHOOK_SECRET") ?? "";
  const secret = url.searchParams.get("secret") ?? "";
  if (!expected || secret !== expected) {
    return new Response("forbidden", { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return new Response("bad request", { status: 400 });
  }

  const eventId =
    (payload as { eventId?: string; resource?: { id?: string } }).eventId ??
    (payload as { resource?: { id?: string } }).resource?.id ??
    crypto.randomUUID();

  const supabase = createAdminClient();
  const { error: dedupErr } = await supabase
    .from("webhooks_log")
    .insert({ provider: "apify", event_id: String(eventId), payload });
  if (dedupErr) {
    if (dedupErr.code === "23505") {
      // Already processed; ack idempotently.
      return new Response(JSON.stringify({ ok: true, dup: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    console.error("webhooks_log insert", dedupErr);
  }

  // @ts-expect-error — Edge Runtime global
  EdgeRuntime.waitUntil(processApifyWebhook(supabase, payload));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

type ApifyResource = {
  id?: string;
  actId?: string;
  status?: string;
  defaultDatasetId?: string;
  usageTotalUsd?: number;
};

type ApifyWebhookPayload = {
  eventType?: string;
  resource?: ApifyResource;
};

async function processApifyWebhook(
  supabase: ReturnType<typeof createAdminClient>,
  payload: ApifyWebhookPayload,
) {
  const resource = payload.resource ?? {};
  const runId = resource.id;
  const actId = resource.actId;
  const status = resource.status ?? payload.eventType;

  if (!runId || !actId) {
    console.error("apify webhook missing runId/actId", payload);
    return;
  }

  const { data: enrichment, error: lookupErr } = await supabase
    .from("enrichments")
    .select("id, org_id, person_id, company_id, request_payload, outcome")
    .eq("provider_request_id", runId)
    .maybeSingle();

  if (lookupErr || !enrichment) {
    console.warn(`apify webhook orphan callback for run ${runId}`, lookupErr?.message);
    return;
  }

  const isSuccess = status === "SUCCEEDED" || status === "ACTOR.RUN.SUCCEEDED";
  if (!isSuccess) {
    await supabase
      .from("enrichments")
      .update({ outcome: "error", error_code: status, error_message: `apify run ${status}` })
      .eq("id", enrichment.id);
    return;
  }

  const actorKind = findActorKeyById(actId);
  if (!actorKind) {
    console.error(`unknown apify actor ${actId} for run ${runId}`);
    return;
  }

  const datasetId = resource.defaultDatasetId;
  if (!datasetId) {
    console.error(`apify webhook missing datasetId for run ${runId}`);
    return;
  }

  let items: unknown[] = [];
  try {
    items = await getDatasetItems(datasetId, { limit: 100 });
  } catch (err) {
    await supabase
      .from("enrichments")
      .update({ outcome: "error", error_message: `dataset fetch failed: ${String(err)}` })
      .eq("id", enrichment.id);
    return;
  }

  const cost = resource.usageTotalUsd ?? 0;

  if (actorKind === "personProfile") {
    const item = items[0] as Record<string, unknown> | undefined;
    if (!item) {
      await markMiss(supabase, enrichment.id, cost);
      return;
    }
    await supabase.rpc("apify_finalize_person", {
      p_enrichment_id: enrichment.id,
      p_item: item,
      p_run_cost_usd: cost,
    });
    // Follow-up: try to find an email for this person.
    if (enrichment.person_id) {
      await enqueue(supabase, "find_email_findymail", { personId: enrichment.person_id }, enrichment.org_id);
    }
    return;
  }

  if (actorKind === "companyProfile") {
    const item = items[0] as Record<string, unknown> | undefined;
    if (!item) {
      await markMiss(supabase, enrichment.id, cost);
      return;
    }
    await supabase.rpc("apify_finalize_company", {
      p_enrichment_id: enrichment.id,
      p_item: item,
      p_run_cost_usd: cost,
    });
    return;
  }

  if (actorKind === "profilePosts") {
    await supabase.rpc("apify_finalize_posts", {
      p_enrichment_id: enrichment.id,
      p_items: items,
      p_run_cost_usd: cost,
    });
    return;
  }
}

async function markMiss(
  supabase: ReturnType<typeof createAdminClient>,
  enrichmentId: number,
  cost: number,
) {
  await supabase
    .from("enrichments")
    .update({ outcome: "miss", usd_cost: cost })
    .eq("id", enrichmentId);
}

async function enqueue(
  supabase: ReturnType<typeof createAdminClient>,
  type: string,
  payload: Record<string, unknown>,
  orgId: string,
) {
  // Direct pgmq.send to bypass the auth-gated public.enqueue_job RPC.
  await supabase.rpc("pgmq_send", {
    queue_name: "jobs",
    msg: {
      type,
      payload,
      org_id: orgId,
      job_id: crypto.randomUUID(),
    },
  });
}
