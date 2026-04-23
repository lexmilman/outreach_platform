"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClientAction, type ActionState } from "../actions";

const initial: ActionState = { ok: false };

export function NewClientForm() {
  const [state, action, pending] = useActionState(createClientAction, initial);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required placeholder="Acme Corp" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">
          Slug <span className="text-xs text-muted-foreground">— optional, auto-generated</span>
        </Label>
        <Input id="slug" name="slug" placeholder="acme-corp" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="icp_description">ICP description</Label>
        <Textarea
          id="icp_description"
          name="icp_description"
          rows={4}
          placeholder="Mid-market SaaS (50-500 ppl) in North America; target VP Eng or CTO; recent funding a plus."
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="brand_voice">Brand voice</Label>
        <Textarea
          id="brand_voice"
          name="brand_voice"
          rows={3}
          placeholder="Concise, peer-to-peer, curious. Never salesy. Quote specific details from the lead's recent posts."
        />
      </div>
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="brand" disabled={pending}>
          {pending ? "Creating…" : "Create client"}
        </Button>
      </div>
    </form>
  );
}
