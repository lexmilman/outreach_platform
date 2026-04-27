"use client";

import { Check, Loader2, Mail, MessageSquare, Search, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/utils";

const TIER_CLASS: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  mid: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  low: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const VERIF_CLASS: Record<string, string> = {
  valid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  invalid: "bg-red-500/15 text-red-700 dark:text-red-300",
  risky: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  accept_all: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  unverified: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  unknown: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  pre_verified: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export function ApifyStatusCell({
  enrichedAt,
  pending,
}: {
  enrichedAt: string | null;
  pending: boolean;
}) {
  if (pending) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-600">
        <Loader2 className="size-3 animate-spin" /> running
      </span>
    );
  }
  if (!enrichedAt) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
      <Check className="size-3" /> {formatRelative(enrichedAt)}
    </span>
  );
}

export function PostsCell({ count }: { count: number | null }) {
  if (!count) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge variant="secondary" className="font-mono text-[11px]">
      {count} post{count === 1 ? "" : "s"}
    </Badge>
  );
}

export function EmailCell({
  email,
  status,
}: {
  email: string | null;
  status: string | null;
}) {
  if (!email) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = status ? VERIF_CLASS[status] : VERIF_CLASS.unverified;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-xs">{email}</span>
      <Badge variant="secondary" className={cn("w-fit text-[10px]", cls)}>
        <Mail className="mr-1 size-2.5" />
        {status ?? "unverified"}
      </Badge>
    </div>
  );
}

export function ScoreCell({
  score,
  tier,
}: {
  score: number | null;
  tier: string | null;
}) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = tier ? TIER_CLASS[tier] : TIER_CLASS.mid;
  return (
    <Badge variant="secondary" className={cn("font-mono text-[11px]", cls)}>
      <Sparkles className="mr-1 size-3" />
      {score} · {tier ?? "?"}
    </Badge>
  );
}

export function MessagesCell({ has }: { has: boolean }) {
  if (!has) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
      <MessageSquare className="size-3" /> 4 bodies
    </span>
  );
}

export function ResearchCell({ at }: { at: string | null }) {
  if (!at) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
      <Search className="size-3" /> {formatRelative(at)}
    </span>
  );
}

export function FailedCell() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-600">
      <X className="size-3" /> failed
    </span>
  );
}
