import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { PeopleGrid } from "@/components/features/grid/people-grid";
import { PersonDrawer } from "@/components/features/profile-drawer/person-drawer";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_people_with_company")
    .select("*")
    .order("created_at", { ascending: false })
    .range(0, 99);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">People</h1>
        <p className="text-sm text-muted-foreground">
          Every person in your global DB. Double-click a name, title, or location to edit.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}

      <PeopleGrid initialRows={data ?? []} />

      <Suspense fallback={null}>
        <PersonDrawer />
      </Suspense>
    </div>
  );
}
