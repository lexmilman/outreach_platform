import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { CompaniesGrid } from "@/components/features/grid/companies-grid";
import { CompanyDrawer } from "@/components/features/profile-drawer/company-drawer";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false })
    .range(0, 99);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Companies</h1>
        <p className="text-sm text-muted-foreground">
          Every company in your global DB. Click a row to see people from that company.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}

      <CompaniesGrid initialRows={data ?? []} />

      <Suspense fallback={null}>
        <CompanyDrawer />
      </Suspense>
    </div>
  );
}
