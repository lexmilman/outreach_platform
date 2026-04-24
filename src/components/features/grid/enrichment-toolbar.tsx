"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { runApifyPersonBatch } from "@/app/(dashboard)/people/enrich-actions";
import { toast } from "sonner";

const LIMIT_OPTIONS = [5, 10, 25, 50, 100];

export function EnrichmentToolbar() {
  const [limit, setLimit] = useState("10");
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const res = await runApifyPersonBatch({ limit: Number(limit) });
      if (!res.ok) {
        toast.error(`Enrichment failed: ${res.error}`);
        return;
      }
      if (res.enqueued === 0) {
        toast.info("No people left without Apify enrichment.");
        return;
      }
      toast.success(`Queued ${res.enqueued} enrichment job(s). Track on /jobs.`);
    });
  };

  return (
    <div className="flex items-center gap-2 rounded-md border bg-card/40 p-2 text-sm">
      <span className="px-2 text-muted-foreground">Bulk enrichment:</span>
      <Select value={limit} onValueChange={setLimit}>
        <SelectTrigger className="h-8 w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LIMIT_OPTIONS.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="brand" disabled={pending} onClick={onClick}>
        <Sparkles className="size-3.5" />
        {pending ? "Queueing..." : "Run on next N people"}
      </Button>
      <span className="ml-auto px-2 text-xs text-muted-foreground">
        Picks people with linkedin_url and no prior Apify enrichment.
      </span>
    </div>
  );
}
