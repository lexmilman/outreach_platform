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

type Row = Database["public"]["Views"]["v_people_with_company"]["Row"];

export function PersonDrawer() {
  const router = useRouter();
  const params = useSearchParams();
  const personId = params.get("person");
  const [person, setPerson] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!personId) {
      setPerson(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("v_people_with_company")
        .select("*")
        .eq("id", personId)
        .maybeSingle();
      if (!cancelled) {
        setPerson((data as Row | null) ?? null);
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

            <section>
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Enrichment history
              </h4>
              <p className="mt-2 text-sm text-muted-foreground">
                None yet — enrichment runs land here in Sprint 3.
              </p>
            </section>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Person not found.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
