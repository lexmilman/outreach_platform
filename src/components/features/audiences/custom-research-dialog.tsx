"use client";

import { useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { runCustomResearch } from "@/app/(dashboard)/audiences/[id]/enrich-actions";

export function CustomResearchDialog({
  open,
  onOpenChange,
  audienceId,
  personId,
  personName,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  audienceId: string;
  personId: string;
  personName: string;
}) {
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (query.trim().length < 3) {
      toast.error("Query must be at least 3 characters");
      return;
    }
    startTransition(async () => {
      const res = await runCustomResearch({ audienceId, personId, query });
      if (res.ok) {
        toast.success(`Queued Perplexity research for ${personName}`);
        setQuery("");
        onOpenChange(false);
      } else {
        toast.error(`Failed: ${res.errors?.[0] ?? "unknown"}`);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="size-4" /> Custom research — {personName}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Sends a free-form query to Perplexity Sonar. Result is merged into
          the person&apos;s <code className="font-mono text-xs">data_json.perplexity</code>.
        </p>
        <Textarea
          rows={5}
          placeholder="e.g. Find this person's company's most recent funding round and major hires in the last 6 months."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={2000}
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="brand" onClick={submit} disabled={pending}>
            {pending ? "Queueing..." : "Run research"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
