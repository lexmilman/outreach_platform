"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCampaignAction, type ActionState } from "../actions";

type Client = { id: string; name: string };
type Audience = { id: string; name: string; client_id: string | null };
type Template = {
  id: string;
  name: string;
  description: string | null;
  steps: unknown;
  is_default: boolean;
};

type Step = { step: number; delay_days: number; subject: string; body: string };

function normalizeSteps(steps: unknown): Step[] {
  if (!Array.isArray(steps)) return [];
  return steps.filter(
    (s): s is Step =>
      !!s &&
      typeof s === "object" &&
      typeof (s as Step).subject === "string" &&
      typeof (s as Step).body === "string",
  );
}

const initial: ActionState = { ok: false };

export function NewCampaignForm({
  clients,
  templates,
  audiences,
}: {
  clients: Client[];
  templates: Template[];
  audiences: Audience[];
}) {
  const [state, action, pending] = useActionState(createCampaignAction, initial);

  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "");
  const [templateId, setTemplateId] = useState<string>(
    templates.find((t) => t.is_default)?.id ?? templates[0]?.id ?? "",
  );
  const [audienceId, setAudienceId] = useState<string>("");

  const audiencesForClient = useMemo(
    () => audiences.filter((a) => a.client_id === clientId),
    [audiences, clientId],
  );

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const steps = normalizeSteps(selectedTemplate?.steps);

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Campaign name</Label>
        <Input id="name" name="name" required placeholder="Q2 VP Eng outbound" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="client_id">Client</Label>
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger id="client_id">
            <SelectValue placeholder="Pick a client" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input type="hidden" name="client_id" value={clientId} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="audience_id">
          Audience <span className="text-xs text-muted-foreground">— optional</span>
        </Label>
        <Select value={audienceId} onValueChange={setAudienceId}>
          <SelectTrigger id="audience_id">
            <SelectValue placeholder="No audience (manual)" />
          </SelectTrigger>
          <SelectContent>
            {audiencesForClient.length === 0 ? (
              <div className="p-2 text-xs text-muted-foreground">
                No audiences for this client. Import a CSV under /audiences first.
              </div>
            ) : (
              audiencesForClient.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <input type="hidden" name="audience_id" value={audienceId} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sequence_template_id">Sequence template</Label>
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger id="sequence_template_id">
            <SelectValue placeholder="Pick a template" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
                {t.is_default ? " · default" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input type="hidden" name="sequence_template_id" value={templateId} />
        {selectedTemplate?.description ? (
          <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>
        ) : null}
      </div>

      {steps.length > 0 ? (
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Preview · {steps.length} steps
          </p>
          <ul className="space-y-1 text-xs">
            {steps.map((s) => (
              <li key={s.step} className="flex gap-3">
                <span className="font-mono text-muted-foreground">
                  +{s.delay_days}d
                </span>
                <span className="truncate font-medium">{s.subject}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="brand" disabled={pending || !clientId || !templateId}>
          {pending ? "Creating…" : "Create campaign"}
        </Button>
      </div>
    </form>
  );
}
