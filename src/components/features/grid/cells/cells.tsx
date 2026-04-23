"use client";

import { ExternalLink, MailCheck, MailWarning } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";

export function NumberCell({ value }: { value: number | null | undefined }) {
  return (
    <div className="px-2 py-1.5 text-right font-mono text-sm tabular-nums">
      {value == null ? <span className="text-muted-foreground">—</span> : value.toLocaleString()}
    </div>
  );
}

export function DateCell({ value }: { value: string | null | undefined }) {
  if (!value) {
    return <div className="px-2 py-1.5 text-sm text-muted-foreground">—</div>;
  }
  return (
    <div className="truncate px-2 py-1.5 text-sm" title={new Date(value).toLocaleString()}>
      {formatRelative(value)}
    </div>
  );
}

export function UrlCell({ value }: { value: string | null | undefined }) {
  if (!value) {
    return <div className="px-2 py-1.5 text-sm text-muted-foreground">—</div>;
  }
  let host = "";
  try {
    host = new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    host = value;
  }
  return (
    <a
      href={value}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-1 truncate px-2 py-1.5 text-sm text-brand-500 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="truncate">{host}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

export function EmailCell({
  value,
  verified,
}: {
  value: string | null | undefined;
  verified?: "valid" | "invalid" | "risky" | "unverified" | "accept_all" | "pre_verified" | null;
}) {
  if (!value) return <div className="px-2 py-1.5 text-sm text-muted-foreground">—</div>;
  const ok = verified === "valid" || verified === "accept_all" || verified === "pre_verified";
  const bad = verified === "invalid" || verified === "risky";
  return (
    <div className="flex items-center gap-1.5 truncate px-2 py-1.5 text-sm">
      {ok ? (
        <MailCheck className="size-3.5 text-emerald-500" />
      ) : bad ? (
        <MailWarning className="size-3.5 text-amber-500" />
      ) : null}
      <a
        href={`mailto:${value}`}
        className="truncate hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {value}
      </a>
    </div>
  );
}

export function AvatarCell({
  src,
  name,
}: {
  src: string | null | undefined;
  name: string | null | undefined;
}) {
  const initials = (name ?? "").slice(0, 2).toUpperCase() || "??";
  return (
    <div className="flex items-center justify-center px-2 py-1">
      <Avatar className="size-6">
        {src ? <AvatarImage src={src} alt={name ?? ""} /> : null}
        <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
      </Avatar>
    </div>
  );
}

export function ScoreBadgeCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <div className="px-2 py-1.5 text-sm text-muted-foreground">—</div>;
  const variant: "success" | "warning" | "destructive" = value >= 75 ? "success" : value >= 50 ? "warning" : "destructive";
  return (
    <div className="px-2 py-1">
      <Badge variant={variant}>{value}</Badge>
    </div>
  );
}

export function CompanyChipCell({
  name,
  logo,
}: {
  name: string | null | undefined;
  logo?: string | null | undefined;
}) {
  if (!name) return <div className="px-2 py-1.5 text-sm text-muted-foreground">—</div>;
  return (
    <div className="flex items-center gap-2 truncate px-2 py-1 text-sm">
      <Avatar className="size-5 rounded">
        {logo ? <AvatarImage src={logo} alt={name} /> : null}
        <AvatarFallback className="rounded text-[9px]">
          {name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
    </div>
  );
}
