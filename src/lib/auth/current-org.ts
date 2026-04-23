import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function currentOrgId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("memberships").select("org_id").limit(1).maybeSingle();
  return data?.org_id ?? null;
}

export async function requireOrgId(): Promise<string> {
  const id = await currentOrgId();
  if (!id) throw new Error("No organization found for the current user");
  return id;
}

export async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
