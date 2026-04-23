import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as
    | "email"
    | "signup"
    | "recovery"
    | "invite"
    | "magiclink"
    | null;
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url),
    );
  }

  // Bootstrap org/membership on first login (idempotent).
  await supabase.rpc("bootstrap_user_org", { p_org_name: "My Agency" });

  return NextResponse.redirect(new URL(next, request.url));
}
