"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pushLeadsToInstantlyAction, type ActionState } from "../actions";

const initial: ActionState = { ok: false };

export function PushLeadsPanel({
  campaignId,
  pushable,
  canPush,
}: {
  campaignId: string;
  pushable: number;
  canPush: boolean;
}) {
  const [state, action, pending] = useActionState(pushLeadsToInstantlyAction, initial);

  useEffect(() => {
    if (!state) return;
    if (!state.ok && state.error) toast.error(state.error);
    else if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <div className="space-y-1">
        <Label htmlFor="limit" className="text-xs">
          Batch size
        </Label>
        <Input
          id="limit"
          name="limit"
          type="number"
          min={1}
          max={1000}
          defaultValue={Math.min(100, pushable || 100)}
          className="w-28"
        />
      </div>
      <Button type="submit" variant="brand" disabled={!canPush || pending || pushable === 0}>
        <Send className="size-4" />
        {pending ? "Queuing…" : `Push ${Math.min(pushable, 1000)} leads`}
      </Button>
      {!canPush ? (
        <p className="text-xs text-muted-foreground">
          Waiting for the Instantly campaign to be created first.
        </p>
      ) : pushable === 0 ? (
        <p className="text-xs text-muted-foreground">
          No leads ready — add leads to the audience and let the enrichment + scoring pipeline finish.
        </p>
      ) : null}
    </form>
  );
}
