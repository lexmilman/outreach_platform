// @ts-nocheck
// Supabase Edge Function: webhooks-signalhire
// Deploy with --no-verify-jwt.
// Verifies ?secret=<SIGNALHIRE_CALLBACK_SECRET>.

import { createAdminClient } from "../_shared/supabase-admin.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const expected = Deno.env.get("SIGNALHIRE_CALLBACK_SECRET") ?? "";
  const secret = url.searchParams.get("secret") ?? "";
  if (!expected || secret !== expected) {
    return new Response("forbidden", { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  if (!Array.isArray(payload)) return new Response("bad request", { status: 400 });

  const requestId = req.headers.get("request-id") ?? crypto.randomUUID();
  const supabase = createAdminClient();
  const { error: dedupErr } = await supabase
    .from("webhooks_log")
    .insert({ provider: "signalhire", event_id: requestId, payload });
  if (dedupErr && dedupErr.code !== "23505") {
    console.error("webhooks_log insert", dedupErr);
  }

  // @ts-expect-error — Edge Runtime global
  EdgeRuntime.waitUntil(processSignalHireCallback(supabase, requestId, payload));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

async function processSignalHireCallback(
  _supabase: ReturnType<typeof createAdminClient>,
  _requestId: string,
  _items: unknown[],
) {
  // TODO(Sprint 3): upsert emails on each candidate, enqueue verify_email_instantly,
  // mark pending request completed.
}
