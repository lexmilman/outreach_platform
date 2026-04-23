import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil, Archive, Trash2, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { archiveClientAction, deleteClientAction } from "../actions";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, slug, icp_description, brand_voice, is_archived, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (!client) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to clients
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{client.name}</h1>
            {client.is_archived ? (
              <Badge variant="secondary">Archived</Badge>
            ) : (
              <Badge variant="success">Active</Badge>
            )}
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{client.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/clients/${client.id}/edit`}>
              <Pencil className="size-4" /> Edit
            </Link>
          </Button>
          {!client.is_archived ? (
            <form action={archiveClientAction}>
              <input type="hidden" name="id" value={client.id} />
              <Button variant="outline" size="sm" type="submit">
                <Archive className="size-4" /> Archive
              </Button>
            </form>
          ) : null}
          <form action={deleteClientAction}>
            <input type="hidden" name="id" value={client.id} />
            <Button variant="destructive" size="sm" type="submit">
              <Trash2 className="size-4" /> Delete
            </Button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ICP description</CardTitle>
            <CardDescription>Used by the relevance scoring prompt.</CardDescription>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">
            {client.icp_description ?? (
              <span className="text-muted-foreground">Not set — add it in Edit.</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Brand voice</CardTitle>
            <CardDescription>Used by the message generation prompt.</CardDescription>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">
            {client.brand_voice ?? (
              <span className="text-muted-foreground">Not set — add it in Edit.</span>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <LinkCard href={`/clients/${client.id}/prompts`} title="Prompts" description="Manage relevance + message prompts with versioning." />
        <LinkCard href="/campaigns" title="Campaigns" description="All Instantly campaigns attached to this client." />
        <LinkCard href="/settings/integrations" title="Integrations" description="Instantly / LLM keys for this client." />
      </div>

      <p className="pt-4 text-xs text-muted-foreground">
        Created {formatRelative(client.created_at)} · Last updated {formatRelative(client.updated_at)}
      </p>
    </div>
  );
}

function LinkCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="group rounded-xl border bg-card p-5 transition-colors hover:border-brand-500/40"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold">{title}</h3>
        <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-brand-500" />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </Link>
  );
}
