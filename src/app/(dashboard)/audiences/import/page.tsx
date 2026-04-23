import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CsvImportWizard } from "@/components/features/csv-import/csv-import-wizard";

export const dynamic = "force-dynamic";

export default async function AudienceImportPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, slug")
    .eq("is_archived", false)
    .order("name");

  return (
    <div className="space-y-6">
      <Link
        href="/audiences"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to audiences
      </Link>
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Import CSV</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Drop a LinkedHelper export — we'll auto-map columns, validate, dedup, and bulk-insert.
        </p>
      </div>
      <CsvImportWizard clients={clients ?? []} />
    </div>
  );
}
