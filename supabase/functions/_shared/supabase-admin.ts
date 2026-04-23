// Shared admin client for Edge Functions. Uses the service role key so RLS is bypassed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.2";

export function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Edge Function env");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
