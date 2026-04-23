// @ts-nocheck
// Supabase Edge Function: instantly-sync
// Runs daily at 05:00 UTC via pg_cron. Pulls Instantly campaign analytics, upserts analytics_snapshots.

import { createAdminClient } from "../_shared/supabase-admin.ts";

Deno.serve(async (_req) => {
  const supabase = createAdminClient();

  // @ts-expect-error — Edge Runtime global
  EdgeRuntime.waitUntil(syncAllRunningCampaigns(supabase));

  return new Response(JSON.stringify({ ok: true }), {
    status: 202,
    headers: { "content-type": "application/json" },
  });
});

async function syncAllRunningCampaigns(_supabase: ReturnType<typeof createAdminClient>) {
  // TODO(Sprint 4): iterate campaigns.status='running' and fetch analytics via the
  // Instantly v2 API, then upsert analytics_snapshots for today's date.
}
