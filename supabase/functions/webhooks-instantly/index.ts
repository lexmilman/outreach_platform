// @ts-nocheck
// Supabase Edge Function: webhooks-instantly
// Deploy with --no-verify-jwt.
// Verifies `Authorization: Bearer <INSTANTLY_WEBHOOK_SECRET>`.

import { createAdminClient } from "../_shared/supabase-admin.ts";

Deno.serve(async (req) => {
  const expected = Deno.env.get("INSTANTLY_WEBHOOK_SECRET") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !constantTimeEquals(token, expected)) {
    return new Response("forbidden", { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) return new Response("bad request", { status: 400 });

  const p = payload as Record<string, unknown>;
  const eventId = [
    p.timestamp,
    p.event_type,
    p.lead_email,
    p.step,
    p.email_id,
  ].filter(Boolean).join("|");

  const supabase = createAdminClient();
  const { error: dedupErr } = await supabase
    .from("webhooks_log")
    .insert({ provider: "instantly", event_id: eventId, payload });
  if (dedupErr && dedupErr.code !== "23505") {
    console.error("webhooks_log insert", dedupErr);
  }

  // @ts-expect-error — Edge Runtime global
  EdgeRuntime.waitUntil(processInstantlyEvent(supabase, payload));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

async function processInstantlyEvent(
  _supabase: ReturnType<typeof createAdminClient>,
  _payload: unknown,
) {
  // TODO(Sprint 3): upsert replies, update people_in_campaign.status, enqueue waterfall_stop/escalate.
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
