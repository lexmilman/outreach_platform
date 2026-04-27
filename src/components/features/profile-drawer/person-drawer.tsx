"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { formatRelative, formatUsd } from "@/lib/utils";

type Row = Database["public"]["Views"]["v_people_with_company"]["Row"];

type EnrichmentLog = {
  id: number;
  provider: string;
  endpoint: string;
  outcome: string;
  usd_cost: number | string | null;
  email_returned: string | null;
  error_message: string | null;
  created_at: string;
};

type EmailRow = {
  id: string;
  email: string;
  source: string;
  verification_status: string;
  is_primary: boolean;
  created_at: string;
};

type PicRow = {
  id: string;
  campaign_id: string;
  relevance_score: number | null;
  relevance_tier: string | null;
  generated_subject: string | null;
};

export function PersonDrawer() {
  const router = useRouter();
  const params = useSearchParams();
  const personId = params.get("person");
  const [person, setPerson] = useState<Row | null>(null);
  const [enrichments, setEnrichments] = useState<EnrichmentLog[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [pics, setPics] = useState<PicRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!personId) {
      setPerson(null);
      setEnrichments([]);
      setEmails([]);
      setPics([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const supabase = createClient();
      const [{ data: p }, { data: enr }, { data: em }, { data: pic }] = await Promise.all([
        supabase.from("v_people_with_company").select("*").eq("id", personId).maybeSingle(),
        supabase
          .from("enrichments")
          .select("*")
          .eq("person_id", personId)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("emails")
          .select("id, email, source, verification_status, is_primary, created_at")
          .eq("person_id", personId)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("people_in_campaign")
          .select("id, campaign_id, relevance_score, relevance_tier, generated_subject")
          .eq("person_id", personId)
          .order("added_at", { ascending: false }),
      ]);
      if (!cancelled) {
        setPerson((p as Row | null) ?? null);
        setEnrichments(((enr ?? []) as unknown as EnrichmentLog[]) ?? []);
        setEmails(((em ?? []) as unknown as EmailRow[]) ?? []);
        setPics(((pic ?? []) as unknown as PicRow[]) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [personId]);

  function close() {
    const sp = new URLSearchParams(params.toString());
    sp.delete("person");
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : `?`, { scroll: false });
  }

  const initials = (person?.full_name ?? "").slice(0, 2).toUpperCase() || "??";
  const email = (person?.data_json as { email?: string } | null)?.email ?? null;

  return (
    <Sheet open={Boolean(personId)} onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : person ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-4">
                <Avatar className="size-14">
                  {person.photo_url ? (
                    <AvatarImage src={person.photo_url} alt={person.full_name ?? ""} />
                  ) : null}
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate">{person.full_name ?? "Unknown"}</SheetTitle>
                  <SheetDescription className="truncate">
                    {person.current_title ?? "—"}
                    {person.company_name ? (
                      <>
                        {" at "}
                        <span className="text-foreground">{person.company_name}</span>
                      </>
                    ) : null}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="mt-4 flex flex-wrap gap-2">
              {person.location ? <Badge variant="secondary">{person.location}</Badge> : null}
              {person.country ? <Badge variant="outline">{person.country}</Badge> : null}
              {person.connections_count ? (
                <Badge variant="outline">{person.connections_count.toLocaleString()} conns</Badge>
              ) : null}
            </div>

            <Separator className="my-4" />

            <section className="space-y-1">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Headline
              </h4>
              <p className="text-sm">{person.headline ?? "—"}</p>
            </section>

            {person.about ? (
              <section className="mt-4 space-y-1">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  About
                </h4>
                <p className="whitespace-pre-wrap text-sm">{person.about}</p>
              </section>
            ) : null}

            <section className="mt-4 space-y-1">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Links
              </h4>
              <ul className="space-y-1 text-sm">
                {person.linkedin_url ? (
                  <li>
                    <a
                      href={person.linkedin_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-brand-500 hover:underline"
                    >
                      LinkedIn profile
                    </a>
                  </li>
                ) : null}
                {email ? (
                  <li>
                    <a href={`mailto:${email}`} className="text-brand-500 hover:underline">
                      {email}
                    </a>
                  </li>
                ) : null}
                {person.company_linkedin_url ? (
                  <li>
                    <a
                      href={person.company_linkedin_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-brand-500 hover:underline"
                    >
                      Company LinkedIn
                    </a>
                  </li>
                ) : null}
              </ul>
            </section>

            <Separator className="my-4" />

            {emails.length > 0 ? (
              <section className="space-y-2">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Emails
                </h4>
                <ul className="space-y-1 text-sm">
                  {emails.map((e) => (
                    <li key={e.id} className="flex items-center gap-2">
                      <span className="font-mono">{e.email}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {e.source}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {e.verification_status}
                      </Badge>
                      {e.is_primary ? (
                        <Badge variant="secondary" className="bg-brand-500/15 text-[10px] text-brand-500">
                          primary
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {pics.length > 0 ? (
              <section className="mt-4 space-y-2">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Campaign scoring
                </h4>
                <ul className="space-y-1 text-sm">
                  {pics.map((pic) => (
                    <li key={pic.id} className="flex items-center gap-2">
                      <span className="font-mono text-xs">{pic.campaign_id.slice(0, 8)}…</span>
                      {pic.relevance_score != null ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {pic.relevance_score} · {pic.relevance_tier ?? "?"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">no score</span>
                      )}
                      {pic.generated_subject ? (
                        <span className="truncate text-xs text-muted-foreground">
                          subj: {pic.generated_subject}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <Separator className="my-4" />

            <section>
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Enrichment history
              </h4>
              {enrichments.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  None yet. Trigger enrichment from the audience grid.
                </p>
              ) : (
                <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                  {enrichments.map((e) => (
                    <li
                      key={e.id}
                      className="flex flex-col gap-1 rounded-md border bg-card/40 p-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {e.provider}
                        </Badge>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {e.endpoint}
                        </span>
                        <Badge
                          variant="secondary"
                          className={
                            e.outcome === "hit"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : e.outcome === "error"
                                ? "bg-red-500/15 text-red-700 dark:text-red-300"
                                : ""
                          }
                        >
                          {e.outcome}
                        </Badge>
                        <span className="ml-auto text-muted-foreground">
                          {formatRelative(e.created_at)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-muted-foreground">
                        {e.email_returned ? (
                          <span className="font-mono">{e.email_returned}</span>
                        ) : null}
                        {e.usd_cost != null ? (
                          <span>{formatUsd(Number(e.usd_cost))}</span>
                        ) : null}
                      </div>
                      {e.error_message ? (
                        <p className="break-all text-red-600">{e.error_message}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Person not found.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
