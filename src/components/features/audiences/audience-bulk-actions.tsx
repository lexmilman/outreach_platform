"use client";

import { useState, useTransition } from "react";
import { Mail, Sparkles, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  runEnrichPersonApify,
  runFindEmail,
  runScoreAndGenerate,
} from "@/app/(dashboard)/audiences/[id]/enrich-actions";

export type CampaignOption = { id: string; name: string };

export function AudienceBulkActions({
  audienceId,
  selectedIds,
  onClear,
  campaigns,
}: {
  audienceId: string;
  selectedIds: string[];
  onClear: () => void;
  campaigns: CampaignOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [campaignId, setCampaignId] = useState<string>("");

  const count = selectedIds.length;

  const fire = (
    label: string,
    action: () => Promise<{ ok: boolean; enqueued: number; skipped: number; errors?: string[] }>,
  ) => {
    if (count === 0) return;
    startTransition(async () => {
      const res = await action();
      const skip = res.skipped > 0 ? `, ${res.skipped} skipped` : "";
      if (res.enqueued > 0) {
        toast.success(`${label}: queued ${res.enqueued}${skip}`);
        onClear();
      } else if (res.errors?.length) {
        toast.error(`${label} failed: ${res.errors[0]}`);
      } else {
        toast.info(`${label}: nothing to do${skip}`);
      }
    });
  };

  if (count === 0) return null;

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md border bg-card/80 p-2 text-sm shadow-sm backdrop-blur">
      <span className="px-2 font-medium">{count} selected</span>
      <span className="text-muted-foreground">·</span>

      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          fire("Enrich profile", () =>
            runEnrichPersonApify({ audienceId, personIds: selectedIds }),
          )
        }
      >
        <Users className="size-3.5" /> Enrich profiles
      </Button>

      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          fire("Find emails", () =>
            runFindEmail({ audienceId, personIds: selectedIds }),
          )
        }
      >
        <Mail className="size-3.5" /> Find emails
      </Button>

      <span className="ml-2 inline-flex items-center gap-1">
        <Select value={campaignId} onValueChange={setCampaignId}>
          <SelectTrigger className="h-8 w-[180px]">
            <SelectValue placeholder="Campaign for scoring..." />
          </SelectTrigger>
          <SelectContent>
            {campaigns.length === 0 ? (
              <SelectItem value="__none__" disabled>
                No campaigns yet
              </SelectItem>
            ) : (
              campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="brand"
          disabled={pending || !campaignId}
          onClick={() => {
            if (!campaignId) return;
            fire("Score & generate", () =>
              runScoreAndGenerate({
                audienceId,
                personIds: selectedIds,
                campaignId,
              }),
            );
          }}
        >
          <Sparkles className="size-3.5" /> Score &amp; generate
        </Button>
      </span>

      <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
        <X className="size-3.5" /> Clear
      </Button>
    </div>
  );
}
