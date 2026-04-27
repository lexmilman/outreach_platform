"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ApifyStatusCell,
  EmailCell,
  MessagesCell,
  PostsCell,
  ResearchCell,
  ScoreCell,
} from "@/components/features/audiences/cells/status-cells";
import { AudienceRowActions } from "./audience-row-actions";
import {
  AudienceBulkActions,
  type CampaignOption,
} from "./audience-bulk-actions";

export type AudienceMemberRow = {
  person_id: string;
  full_name: string | null;
  current_title: string | null;
  company_name: string | null;
  current_company_id: string | null;
  apify_at: string | null; // people.updated_at when data_json.apify present
  posts_count: number | null;
  primary_email: string | null;
  email_status: string | null;
  pic_id: string | null;
  relevance_score: number | null;
  relevance_tier: string | null;
  has_messages: boolean;
  perplexity_at: string | null;
  added_at: string;
};

export function AudienceGrid({
  audienceId,
  rows,
  campaigns,
}: {
  audienceId: string;
  rows: AudienceMemberRow[];
  campaigns: CampaignOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someChecked = selected.size > 0 && !allChecked;

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.person_id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clear = () => setSelected(new Set());

  // The first matching campaign gets pre-selected for row-level "Score" action.
  const defaultCampaignId = campaigns[0]?.id ?? null;

  return (
    <div className="space-y-3">
      <AudienceBulkActions
        audienceId={audienceId}
        selectedIds={selectedIds}
        onClear={clear}
        campaigns={campaigns}
      />

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[36px]">
                <Checkbox
                  checked={allChecked || (someChecked ? "indeterminate" : false)}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Apify</TableHead>
              <TableHead>Posts</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Messages</TableHead>
              <TableHead>Research</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.person_id} data-selected={selected.has(r.person_id)}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(r.person_id)}
                    onCheckedChange={() => toggleOne(r.person_id)}
                    aria-label={`Select ${r.full_name ?? r.person_id}`}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={`/people?person=${r.person_id}`}
                    className="text-brand-500 hover:underline"
                  >
                    {r.full_name ?? "(no name)"}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">{r.current_title ?? "—"}</TableCell>
                <TableCell className="text-sm">{r.company_name ?? "—"}</TableCell>
                <TableCell>
                  <ApifyStatusCell enrichedAt={r.apify_at} pending={false} />
                </TableCell>
                <TableCell>
                  <PostsCell count={r.posts_count} />
                </TableCell>
                <TableCell>
                  <EmailCell email={r.primary_email} status={r.email_status} />
                </TableCell>
                <TableCell>
                  <ScoreCell score={r.relevance_score} tier={r.relevance_tier} />
                </TableCell>
                <TableCell>
                  <MessagesCell has={r.has_messages} />
                </TableCell>
                <TableCell>
                  <ResearchCell at={r.perplexity_at} />
                </TableCell>
                <TableCell>
                  <AudienceRowActions
                    audienceId={audienceId}
                    personId={r.person_id}
                    personName={r.full_name ?? "(no name)"}
                    hasEmail={Boolean(r.primary_email)}
                    hasCompany={Boolean(r.current_company_id)}
                    campaignId={defaultCampaignId}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
