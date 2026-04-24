// @ts-nocheck
// Supabase Edge Function: instantly-sync
// Scheduled daily at 05:00 UTC via pg_cron ("instantly-daily-sync").
// Pulls campaigns.analytics.overview for every campaign with a live
// Instantly link and upserts today's row in public.analytics_snapshots.
//
// Rather than duplicate the logic, we import the shared worker handler which
// does the fetch + UPSERT dance. When called from cron with an empty body,
// every running campaign is synced. When called with {"campaignId": "..."},
// a single campaign is synced (handy for the "Sync stats" button).

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { handleSyncInstantlyStats } from "../_shared/handlers-instantly.ts";

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const supabase = createAdminClient();

  // Fire-and-forget so the cron invocation returns within 5s. Errors are
  // swallowed to the log — the next tick will retry.
  // @ts-expect-error — Edge Runtime global
  EdgeRuntime.waitUntil(
    handleSyncInstantlyStats(
      supabase,
      { campaignId: typeof body?.campaignId === "string" ? body.campaignId : undefined },
      "", // orgId unused inside the handler; we enumerate campaigns directly.
    ).catch((err) => console.error("instantly-sync failed", err)),
  );

  return new Response(JSON.stringify({ ok: true }), {
    status: 202,
    headers: { "content-type": "application/json" },
  });
});
