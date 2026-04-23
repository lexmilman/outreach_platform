import Link from "next/link";
import { Plus } from "lucide-react";
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

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, name, slug, is_archived, icp_description, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Your agency's customers. Each client owns its own campaigns, prompts, and Instantly workspace.
          </p>
        </div>
        <Button asChild variant="brand">
          <Link href="/clients/new">
            <Plus className="size-4" /> New client
          </Link>
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}

      {!clients || clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <div className="size-12 rounded-lg bg-brand-gradient" aria-hidden />
          <h3 className="mt-4 font-display text-lg font-semibold">No clients yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Create your first client to start importing audiences and running campaigns.
          </p>
          <Button asChild variant="brand" className="mt-6">
            <Link href="/clients/new">
              <Plus className="size-4" /> Create client
            </Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/clients/${c.id}`}
                      className="font-medium hover:text-brand-500"
                    >
                      {c.name}
                    </Link>
                    {c.icp_description ? (
                      <p className="line-clamp-1 text-xs text-muted-foreground">{c.icp_description}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{c.slug}</TableCell>
                  <TableCell>
                    {c.is_archived ? (
                      <Badge variant="secondary">Archived</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatRelative(c.created_at)}
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
