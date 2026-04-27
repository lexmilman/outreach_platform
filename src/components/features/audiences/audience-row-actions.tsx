"use client";

import { useState, useTransition } from "react";
import {
  Building2,
  Mail,
  MoreHorizontal,
  Search,
  Sparkles,
  StickyNote,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  runEnrichCompanyApify,
  runEnrichPersonApify,
  runFindEmail,
  runScoreAndGenerate,
  runScrapePosts,
  runVerifyEmail,
} from "@/app/(dashboard)/audiences/[id]/enrich-actions";
import { CustomResearchDialog } from "./custom-research-dialog";

export function AudienceRowActions({
  audienceId,
  personId,
  personName,
  hasEmail,
  hasCompany,
  campaignId,
}: {
  audienceId: string;
  personId: string;
  personName: string;
  hasEmail: boolean;
  hasCompany: boolean;
  campaignId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [researchOpen, setResearchOpen] = useState(false);

  const fire = (
    label: string,
    action: () => Promise<{ ok: boolean; enqueued: number; errors?: string[] }>,
  ) => {
    startTransition(async () => {
      const res = await action();
      if (res.ok) toast.success(`${label}: queued ${res.enqueued} job(s)`);
      else toast.error(`${label} failed: ${res.errors?.[0] ?? "skipped"}`);
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            aria-label={`Actions for ${personName}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs">Apify (LinkedIn scrape)</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() =>
              fire("Enrich profile", () =>
                runEnrichPersonApify({ audienceId, personIds: [personId] }),
              )
            }
          >
            <Users className="size-3.5" /> Enrich profile
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              fire("Scrape posts", () =>
                runScrapePosts({ audienceId, personIds: [personId] }),
              )
            }
          >
            <StickyNote className="size-3.5" /> Scrape posts
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasCompany}
            onClick={() =>
              fire("Enrich company", () =>
                runEnrichCompanyApify({ audienceId, personIds: [personId] }),
              )
            }
          >
            <Building2 className="size-3.5" /> Enrich company
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">Email waterfall</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() =>
              fire("Find email", () =>
                runFindEmail({ audienceId, personIds: [personId] }),
              )
            }
          >
            <Mail className="size-3.5" /> Find email
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasEmail}
            onClick={() =>
              fire("Verify email", () =>
                runVerifyEmail({ audienceId, personIds: [personId] }),
              )
            }
          >
            <Mail className="size-3.5" /> Verify email
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">LLM</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!campaignId}
            onClick={() => {
              if (!campaignId) return;
              fire("Score & generate", () =>
                runScoreAndGenerate({ audienceId, personIds: [personId], campaignId }),
              );
            }}
          >
            <Sparkles className="size-3.5" /> Score &amp; generate
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setResearchOpen(true)}>
            <Search className="size-3.5" /> Custom research…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CustomResearchDialog
        open={researchOpen}
        onOpenChange={setResearchOpen}
        audienceId={audienceId}
        personId={personId}
        personName={personName}
      />
    </>
  );
}
