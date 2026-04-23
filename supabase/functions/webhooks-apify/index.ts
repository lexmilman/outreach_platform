// @ts-nocheck
// Supabase Edge Function: webhooks-apify
// Deploy with --no-verify-jwt.
// Verifies ?secret=<APIFY_WEBHOOK_SECRET>; dedupes on (provider, event_id); upserts dataset.

import { createAdminClient } from "../_shared/supabase-admin.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const expected = Deno.env.get("APIFY_WEBHOOK_SECRET") ?? "";
  const secret = url.searchParams.get("secret") ?? "";
  if (!expected || secret !== expected) {
    return new Response("forbidden", { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) return new Response("bad request", { status: 400 });

  const eventId =
    (payload as { eventId?: string; resource?: { id?: string } }).eventId ??
    (payload as { resource?: { id?: string } }).resource?.id ??
    crypto.randomUUID();

  const supabase = createAdminClient();
  const { error: dedupErr } = await supabase
    .from("webhooks_log")
    .insert({ provider: "apify", event_id: String(eventId), payload })
    .select();
  // duplicate primary key -> already handled
  if (dedupErr && dedupErr.code !== "23505") {
    console.error("webhooks_log insert", dedupErr);
  }

  // @ts-expect-error — Edge Runtime global
  EdgeRuntime.waitUntil(processApifyWebhook(supabase, payload));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

async function processApifyWebhook(
  _supabase: ReturnType<typeof createAdminClient>,
  _payload: unknown,
) {
  // TODO(Sprint 3): fetch dataset items, upsert people/companies, write enrichments,
  // enqueue next step (e.g. find_email_findymail).
}
