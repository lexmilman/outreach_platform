import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import { DeleteAudienceButton } from "@/components/features/audiences/delete-audience-button";
import {
  AudienceGrid,
  type AudienceMemberRow,
} from "@/components/features/audiences/audience-grid";
import type { CampaignOption } from "@/components/features/audiences/audience-bulk-actions";

export const dynamic = "force-dynamic";

type Joined = {
  id: string;
  full_name: string | null;
  current_title: string | null;
  current_company_id: string | null;
  posts: unknown;
  data_json: unknown;
  updated_at: string | null;
  companies: { name: string | null } | null;
};

type EmailRow = {
  email: string;
  verification_status: string | null;
  is_primary: boolean;
  created_at: string;
  person_id: string;
};

type PicRow = {
  id: string;
  person_id: string;
  relevance_score: number | null;
  relevance_tier: string | null;
  generated_subject: string | null;
};

export default async function AudienceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: audience }, { data: members }] = await Promise.all([
    supabase
      .from("audiences")
      .select("id, name, source, row_count, created_at, client_id, org_id")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("audience_members")
      .select(
        "person_id, added_at, people:person_id(id, full_name, current_title, current_company_id, posts, data_json, updated_at, companies:current_company_id(name))",
      )
      .eq("audience_id", id)
      .order("added_at", { ascending: false })
      .limit(500),
  ]);

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

  const personIds = (members ?? [])
    .map((m) => {
      const p = (Array.isArray(m.people) ? m.people[0] : m.people) as Joined | null;
      return p?.id ?? (m.person_id as string);
    })
    .filter(Boolean);

  // Fetch in parallel: emails for these people + their PIC rows + campaigns for the org.
  const [{ data: emails }, { data: pics }, { data: campaigns }] = await Promise.all([
    personIds.length > 0
      ? supabase
          .from("emails")
          .select("email, verification_status, is_primary, created_at, person_id")
          .in("person_id", personIds)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as EmailRow[] }),
    personIds.length > 0
      ? supabase
          .from("people_in_campaign")
          .select("id, person_id, relevance_score, relevance_tier, generated_subject")
          .in("person_id", personIds)
      : Promise.resolve({ data: [] as PicRow[] }),
    supabase
      .from("campaigns")
      .select("id, name, status")
      .eq("org_id", audience.org_id)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
  ]);

  // Pick primary (or most recent) email per person
  const emailByPerson = new Map<string, { email: string; status: string | null }>();
  for (const e of (emails ?? []) as EmailRow[]) {
    if (!emailByPerson.has(e.person_id)) {
      emailByPerson.set(e.person_id, { email: e.email, status: e.verification_status });
    }
  }

  // PIC summary per person (latest if multiple campaigns; here we pick max score)
  const picByPerson = new Map<string, PicRow>();
  for (const p of (pics ?? []) as PicRow[]) {
    const cur = picByPerson.get(p.person_id);
    if (!cur || (p.relevance_score ?? -1) > (cur.relevance_score ?? -1)) {
      picByPerson.set(p.person_id, p);
    }
  }

  const rows: AudienceMemberRow[] = (members ?? []).map((m) => {
    const p = (Array.isArray(m.people) ? m.people[0] : m.people) as Joined | null;
    const personId = (p?.id ?? m.person_id) as string;
    const dataJson = (p?.data_json ?? null) as Record<string, unknown> | null;
    const apifyPresent = Boolean(dataJson && (dataJson as Record<string, unknown>).apify);
    const perplexity = dataJson?.perplexity as { fetched_at?: string } | undefined;
    const postsArr = Array.isArray(p?.posts) ? (p?.posts as unknown[]) : null;
    const email = emailByPerson.get(personId);
    const pic = picByPerson.get(personId);
    return {
      person_id: personId,
      full_name: p?.full_name ?? null,
      current_title: p?.current_title ?? null,
      company_name: p?.companies?.name ?? null,
      current_company_id: p?.current_company_id ?? null,
      apify_at: apifyPresent ? (p?.updated_at ?? null) : null,
      posts_count: postsArr ? postsArr.length : null,
      primary_email: email?.email ?? null,
      email_status: email?.status ?? null,
      pic_id: pic?.id ?? null,
      relevance_score: pic?.relevance_score ?? null,
      relevance_tier: pic?.relevance_tier ?? null,
      has_messages: Boolean(pic?.generated_subject),
      perplexity_at: perplexity?.fetched_at ?? null,
      added_at: m.added_at as string,
    };
  });

  const campaignOptions: CampaignOption[] = (campaigns ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
  }));

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

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          No members linked to this audience.
          <br />
          <span className="text-xs">
            (If this import ran before the audience-link RPC existed, members aren&apos;t
            retroactively linked. Re-import the CSV to populate.)
          </span>
        </div>
      ) : (
        <AudienceGrid audienceId={audience.id} rows={rows} campaigns={campaignOptions} />
      )}

      {rows.length >= 500 ? (
        <p className="px-2 text-xs text-muted-foreground">
          Showing first 500 members. Pagination ships in a later sprint.
        </p>
      ) : null}
    </div>
  );
}
