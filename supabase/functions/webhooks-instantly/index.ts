// @ts-nocheck
// Supabase Edge Function: webhooks-instantly
// Deploy with --no-verify-jwt.
// Verifies `Authorization: Bearer <INSTANTLY_WEBHOOK_SECRET>`.
//
// What it does (Sprint 4):
//   1. Auth + constant-time secret compare.
//   2. Dedupe on (provider, event_id) via public.webhooks_log.
//   3. Parse the event loosely — Instantly occasionally ships new event_type
//      values we haven't seen; we log and skip instead of 4xx-ing.
//   4. Route each event to the DB update path:
//       - reply_received / auto_reply_received / lead_interested / lead_meeting_booked
//         -> insert a replies row (idempotent on instantly_event_id)
//         -> bump people_in_campaign.status and last_event_at
//         -> increment analytics_snapshots counters for today
//       - email_sent / email_opened / email_link_clicked / email_bounced /
//         lead_unsubscribed / campaign_completed -> just bump PIC status + counters
//   5. ACK with 200 within 5s; heavy work is inside EdgeRuntime.waitUntil.

import { createAdminClient } from "../_shared/supabase-admin.ts";

type Supabase = ReturnType<typeof createAdminClient>;

Deno.serve(async (req) => {
  const expected = Deno.env.get("INSTANTLY_WEBHOOK_SECRET") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !constantTimeEquals(token, expected)) {
    return new Response("forbidden", { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return new Response("bad request", { status: 400 });
  }

  const p = payload as Record<string, unknown>;
  const eventId = computeEventId(p);

  const supabase = createAdminClient();
  const { error: dedupErr } = await supabase
    .from("webhooks_log")
    .insert({ provider: "instantly", event_id: eventId, payload });
  if (dedupErr && dedupErr.code === "23505") {
    // Already seen — ACK and stop.
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (dedupErr) {
    console.error("webhooks_log insert", dedupErr);
  }

  // @ts-expect-error — Edge Runtime global
  EdgeRuntime.waitUntil(processInstantlyEvent(supabase, eventId, p));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

function computeEventId(p: Record<string, unknown>): string {
  const parts = [p.timestamp, p.event_type, p.lead_email, p.step, p.email_id].filter(Boolean);
  return parts.join("|");
}

async function processInstantlyEvent(
  supabase: Supabase,
  eventId: string,
  p: Record<string, unknown>,
) {
  const eventType = typeof p.event_type === "string" ? p.event_type : null;
  const campaignKey = typeof p.campaign_id === "string" ? p.campaign_id : null;
  const leadEmail = typeof p.lead_email === "string" ? p.lead_email.toLowerCase() : null;
  if (!eventType) {
    console.warn("instantly event missing event_type", p);
    return;
  }

  // Resolve our internal campaign + person_in_campaign rows. Instantly's
  // campaign_id is a string on our side (campaigns.instantly_campaign_id).
  let campaignRow: { id: string; client_id: string; org_id: string } | null = null;
  if (campaignKey) {
    const { data } = await supabase
      .from("campaigns")
      .select("id, client_id, org_id")
      .eq("instantly_campaign_id", campaignKey)
      .maybeSingle();
    campaignRow = data as typeof campaignRow;
  }

  let pic: { id: string; person_id: string | null } | null = null;
  if (campaignRow && leadEmail) {
    const { data } = await supabase
      .from("people_in_campaign")
      .select("id, person_id")
      .eq("campaign_id", campaignRow.id)
      .eq("email_used", leadEmail)
      .maybeSingle();
    pic = data as typeof pic;
  }

  const isReply =
    eventType === "reply_received" ||
    eventType === "auto_reply_received" ||
    eventType === "lead_interested" ||
    eventType === "lead_meeting_booked";

  if (isReply && campaignRow) {
    const isPositive = eventType === "lead_interested" || eventType === "lead_meeting_booked";
    const aiScore = typeof p.ai_interest_score === "number" ? p.ai_interest_score : null;

    // `replies.instantly_event_id` has a unique index — upsert is idempotent.
    await supabase.from("replies").upsert(
      {
        org_id: campaignRow.org_id,
        campaign_id: campaignRow.id,
        client_id: campaignRow.client_id,
        person_id: pic?.person_id ?? null,
        instantly_event_id: eventId,
        is_positive: isPositive,
        ai_interest_score: aiScore,
        reply_text: typeof p.reply_text === "string" ? p.reply_text : null,
        reply_html: typeof p.reply_html === "string" ? p.reply_html : null,
        step: typeof p.step === "number" ? p.step : null,
        variant: typeof p.variant === "number" ? p.variant : null,
        received_at: typeof p.timestamp === "string" ? p.timestamp : new Date().toISOString(),
      },
      { onConflict: "instantly_event_id", ignoreDuplicates: true },
    );
  }

  if (pic) {
    const nextStatus = picStatusForEvent(eventType);
    if (nextStatus) {
      await supabase
        .from("people_in_campaign")
        .update({ status: nextStatus, last_event_at: new Date().toISOString() })
        .eq("id", pic.id);
    }
  }

  // Increment today's analytics_snapshot counter. We use an RPC-free upsert
  // with a read-modify-write cycle because Instantly delivers events at most
  // a few per second per campaign and idempotency is guaranteed upstream.
  const column = analyticsColumnForEvent(eventType);
  if (column && campaignRow) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: existing } = await supabase
      .from("analytics_snapshots")
      .select("id, sent, opened, replied, positive_replied, bounced, unsubscribed, clicked, completed, total_meeting_booked, total_interested")
      .eq("campaign_id", campaignRow.id)
      .eq("day", today)
      .maybeSingle();

    const nextRow: Record<string, unknown> = {
      org_id: campaignRow.org_id,
      campaign_id: campaignRow.id,
      day: today,
    };
    if (existing) {
      for (const k of [
        "sent","opened","replied","positive_replied","bounced","unsubscribed","clicked","completed","total_meeting_booked","total_interested",
      ] as const) {
        nextRow[k] = existing[k] ?? 0;
      }
      nextRow[column] = ((existing[column] as number | null) ?? 0) + 1;
    } else {
      nextRow[column] = 1;
    }
    await supabase.from("analytics_snapshots").upsert(nextRow, {
      onConflict: "campaign_id,day",
    });
  }
}

function picStatusForEvent(eventType: string): string | null {
  switch (eventType) {
    case "email_sent":
      return "sent";
    case "email_opened":
      return "opened";
    case "email_link_clicked":
      return "clicked";
    case "reply_received":
    case "auto_reply_received":
      return "replied";
    case "lead_interested":
    case "lead_meeting_booked":
      return "positive_reply";
    case "email_bounced":
      return "bounced";
    case "lead_unsubscribed":
      return "unsubscribed";
    case "campaign_completed":
      return "completed";
    default:
      return null;
  }
}

function analyticsColumnForEvent(eventType: string): string | null {
  switch (eventType) {
    case "email_sent":
      return "sent";
    case "email_opened":
      return "opened";
    case "email_link_clicked":
      return "clicked";
    case "reply_received":
    case "auto_reply_received":
      return "replied";
    case "lead_interested":
      return "positive_replied";
    case "lead_meeting_booked":
      return "total_meeting_booked";
    case "email_bounced":
      return "bounced";
    case "lead_unsubscribed":
      return "unsubscribed";
    case "campaign_completed":
      return "completed";
    default:
      return null;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
