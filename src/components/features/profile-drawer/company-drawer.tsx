"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type Company = Database["public"]["Tables"]["companies"]["Row"];
type PersonMini = Pick<
  Database["public"]["Tables"]["people"]["Row"],
  "id" | "full_name" | "current_title" | "photo_url"
>;

export function CompanyDrawer() {
  const router = useRouter();
  const params = useSearchParams();
  const companyId = params.get("company");
  const [company, setCompany] = useState<Company | null>(null);
  const [people, setPeople] = useState<PersonMini[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setCompany(null);
      setPeople([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const supabase = createClient();
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
        supabase
          .from("people")
          .select("id, full_name, current_title, photo_url")
          .eq("current_company_id", companyId)
          .limit(25),
      ]);
      if (!cancelled) {
        setCompany((c as Company | null) ?? null);
        setPeople((p as PersonMini[]) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  function close() {
    const sp = new URLSearchParams(params.toString());
    sp.delete("company");
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : `?`, { scroll: false });
  }

  return (
    <Sheet open={Boolean(companyId)} onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : company ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-4">
                <Avatar className="size-14 rounded">
                  {company.logo_url ? (
                    <AvatarImage src={company.logo_url} alt={company.name ?? ""} />
                  ) : null}
                  <AvatarFallback className="rounded">
                    {(company.name ?? "").slice(0, 2).toUpperCase() || "??"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <SheetTitle className="truncate">{company.name ?? "Unknown"}</SheetTitle>
                  <SheetDescription className="truncate">
                    {company.industry ?? "—"}
                    {company.employee_count ? (
                      <> · {company.employee_count.toLocaleString()} employees</>
                    ) : null}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="mt-4 flex flex-wrap gap-2">
              {company.hq_city ? <Badge variant="secondary">{company.hq_city}</Badge> : null}
              {company.hq_country ? <Badge variant="outline">{company.hq_country}</Badge> : null}
              {company.domain ? <Badge variant="outline">{company.domain}</Badge> : null}
            </div>

            {company.description ? (
              <section className="mt-4 space-y-1">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  About
                </h4>
                <p className="whitespace-pre-wrap text-sm">{company.description}</p>
              </section>
            ) : null}

            <Separator className="my-4" />

            <section>
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                People in DB from this company
              </h4>
              {people.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">None.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {people.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 rounded-md border p-2">
                      <Avatar className="size-7">
                        {p.photo_url ? <AvatarImage src={p.photo_url} alt={p.full_name ?? ""} /> : null}
                        <AvatarFallback className="text-[10px]">
                          {(p.full_name ?? "").slice(0, 2).toUpperCase() || "??"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.full_name ?? "Unknown"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.current_title ?? "—"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">Company not found.</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
