"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { updateClientAction, type ActionState } from "../../actions";

type Client = {
  id: string;
  name: string;
  slug: string;
  icp_description: string | null;
  brand_voice: string | null;
  is_archived: boolean;
};

const initial: ActionState = { ok: false };

export function EditClientForm({ client }: { client: Client }) {
  const [state, action, pending] = useActionState(updateClientAction, initial);

  useEffect(() => {
    if (state.ok) toast.success("Client updated");
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={client.id} />
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={client.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          name="slug"
          defaultValue={client.slug}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="icp_description">ICP description</Label>
        <Textarea
          id="icp_description"
          name="icp_description"
          rows={4}
          defaultValue={client.icp_description ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="brand_voice">Brand voice</Label>
        <Textarea
          id="brand_voice"
          name="brand_voice"
          rows={3}
          defaultValue={client.brand_voice ?? ""}
        />
      </div>
      <div className="flex items-center justify-between rounded-md border px-4 py-3">
        <div>
          <Label htmlFor="is_archived" className="text-sm">
            Archived
          </Label>
          <p className="text-xs text-muted-foreground">
            Archived clients stay in the DB but are hidden from workflows.
          </p>
        </div>
        <Switch id="is_archived" name="is_archived" defaultChecked={client.is_archived} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="brand" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
