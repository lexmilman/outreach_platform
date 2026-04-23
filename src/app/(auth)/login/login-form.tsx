"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";
import { signInWithOtp, type SignInState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: SignInState = { ok: false };

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [state, formAction, isPending] = useActionState(signInWithOtp, initial);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@agency.com"
        />
      </div>
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="brand" className="w-full" disabled={isPending}>
        <Mail className="size-4" />
        {isPending ? "Sending link…" : "Send magic link"}
      </Button>
    </form>
  );
}
