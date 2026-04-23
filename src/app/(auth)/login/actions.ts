"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const SignInSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  next: z.string().optional(),
});

export type SignInState = {
  ok: boolean;
  error?: string;
};

export async function signInWithOtp(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = SignInSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/auth/confirm${
        parsed.data.next ? `?next=${encodeURIComponent(parsed.data.next)}` : ""
      }`,
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  redirect(`/login/check-email?email=${encodeURIComponent(parsed.data.email)}`);
}
