import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/utils";
import { DeleteAudienceButton } from "@/components/features/audiences/delete-audience-button";

export const dynamic = "force-dynamic";

export default async function AudiencesPage() {
  const supabase = await createClient();
  const [{ data: audiences, error }, { data: clients }] = await Promise.all([
    supabase
      .from("audiences")
      .select("id, name, source, row_count, created_at, client_id")
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("id, name"),
  ]);
  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Audiences</h1>
          <p className="text-sm text-muted-foreground">
            LinkedHelper CSV imports. Each audience is a named cohort attached to one client.
          </p>
        </div>
        <Button asChild variant="brand">
          <Link href="/audiences/import">
            <Plus className="size-4" /> Import CSV
          </Link>
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}

      {!audiences || audiences.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <Users className="size-10 text-brand-500" />
          <h3 className="mt-4 font-display text-lg font-semibold">No audiences yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Drop a LinkedHelper CSV and we'll auto-map columns, dedup, and enrich.
          </p>
          <Button asChild variant="brand" className="mt-6">
            <Link href="/audiences/import">
              <Plus className="size-4" /> Import CSV
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Imported</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {audiences.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    <Link href={`/audiences/${a.id}`} className="text-brand-500 hover:underline">
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.client_id ? (clientById.get(a.client_id) ?? "—") : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{a.row_count.toLocaleString()}</Badge>
                  </TableCell>
                  <TableCell className="text-xs uppercase text-muted-foreground">
                    {a.source}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatRelative(a.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DeleteAudienceButton audienceId={a.id} audienceName={a.name} variant="icon" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
