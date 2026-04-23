import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { clientEnv } from "@/lib/env.client";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * Admin client using the service role key. Bypasses RLS.
 * Only use from:
 *   - Edge Functions (webhooks, worker, cron)
 *   - Explicit admin-only Server Actions
 * Never import from Client Components.
 */
export function createAdminClient() {
  const pub = clientEnv();
  const srv = serverEnv();
  return createSupabaseClient<Database>(
    pub.NEXT_PUBLIC_SUPABASE_URL,
    srv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
