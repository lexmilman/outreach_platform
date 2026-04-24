import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRelative } from "@/lib/utils";
import { DeleteAudienceButton } from "@/components/features/audiences/delete-audience-button";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  full_name: string | null;
  linkedin_url: string | null;
  linkedin_hash_id: string | null;
  headline: string | null;
  current_title: string | null;
  location: string | null;
  company_name: string | null;
  added_at: string;
};

export default async function AudienceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: audience }, { data: client }, { data: members }] = await Promise.all([
    supabase
      .from("audiences")
      .select("id, name, source, row_count, created_at, client_id, org_id")
      .eq("id", id)
      .maybeSingle(),
    // Client name (optional) — fetched after we know client_id, but run in parallel
    // with a best-effort nullable .in query below. Simpler: second await.
    Promise.resolve({ data: null }),
    supabase
      .from("audience_members")
      .select(
        "person_id, added_at, people:person_id(id, full_name, linkedin_url, linkedin_hash_id, headline, current_title, location, current_company_id, companies:current_company_id(name))",
      )
      .eq("audience_id", id)
      .order("added_at", { ascending: false })
      .limit(500),
  ]);
  void client;

  if (!audience) notFound();

  let clientName: string | null = null;
  if (audience.client_id) {
    const { data: c } = await supabase
      .from("clients")
      .select("name")
      .eq("id", audience.client_id)
      .maybeSingle();
    clientName = c?.name ?? null;
  }

  const rows: Row[] = (members ?? []).map((m) => {
    // Supabase types the join as an array; narrow to single.
    type Joined = {
      id: string;
      full_name: string | null;
      linkedin_url: string | null;
      linkedin_hash_id: string | null;
      headline: string | null;
      current_title: string | null;
      location: string | null;
      companies: { name: string | null } | null;
    };
    const p = (Array.isArray(m.people) ? m.people[0] : m.people) as Joined | null;
    return {
      id: p?.id ?? m.person_id,
      full_name: p?.full_name ?? null,
      linkedin_url: p?.linkedin_url ?? null,
      linkedin_hash_id: p?.linkedin_hash_id ?? null,
      headline: p?.headline ?? null,
      current_title: p?.current_title ?? null,
      location: p?.location ?? null,
      company_name: p?.companies?.name ?? null,
      added_at: m.added_at,
    };
  });

  return (
    <div className="space-y-6">
      <Link
        href="/audiences"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to audiences
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{audience.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{audience.row_count.toLocaleString()} rows imported</Badge>
            <Badge variant="outline" className="uppercase">
              {audience.source}
            </Badge>
            {clientName ? <Badge variant="outline">client: {clientName}</Badge> : null}
            <span>· {formatRelative(audience.created_at)}</span>
          </div>
        </div>
        <DeleteAudienceButton
          audienceId={audience.id}
          audienceName={audience.name}
          variant="default"
          redirectToList
        />
      </div>

      <div className="rounded-xl border bg-card">
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">
            No members linked to this audience.
            <br />
            <span className="text-xs">
              (If this import ran before the audience-link RPC existed, members aren&apos;t
              retroactively linked. Re-import the CSV to populate.)
            </span>
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.linkedin_url ? (
                      <Link
                        href={`/people?person=${r.id}`}
                        className="text-brand-500 hover:underline"
                      >
                        {r.full_name ?? "(no name)"}
                      </Link>
                    ) : (
                      (r.full_name ?? "(no name)")
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{r.current_title ?? r.headline ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.company_name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.location ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatRelative(r.added_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {rows.length >= 500 ? (
          <p className="border-t px-6 py-3 text-xs text-muted-foreground">
            Showing first 500 members. Full list view ships in a later sprint.
          </p>
        ) : null}
      </div>
    </div>
  );
}
