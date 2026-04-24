import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, RefreshCw, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/utils";
import {
  archiveCampaignAction,
  retryCreateInstantlyCampaignAction,
  syncCampaignStatsAction,
} from "../actions";
import { PushLeadsPanel } from "./push-leads-panel";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "secondary" | "success" | "default" | "destructive"> = {
  draft: "secondary",
  ready: "default",
  running: "success",
  paused: "secondary",
  completed: "secondary",
  archived: "destructive",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: campaign },
    { data: kpis },
    { data: leadStats },
    { data: syncState },
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select(`
        id, name, status, instantly_campaign_id, created_at, updated_at, config,
        client:clients(id, name),
        audience:audiences(id, name)
      `)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("v_campaign_kpis")
      .select("sent, opened, replied, positive_replied, bounced, unsubscribed, meetings, usd_cost, open_rate_pct, reply_rate_pct, positive_rate_pct, usd_per_reply")
      .eq("campaign_id", id)
      .maybeSingle(),
    supabase
      .from("people_in_campaign")
      .select("status")
      .eq("campaign_id", id),
    supabase
      .from("instantly_sync_state")
      .select("last_sync_at")
      .eq("campaign_id", id)
      .maybeSingle(),
  ]);

  if (!campaign) notFound();

  const configObj = (campaign.config && typeof campaign.config === "object" && !Array.isArray(campaign.config)
    ? (campaign.config as Record<string, unknown>)
    : null);
  const templateRaw = configObj?.sequence_template_id;
  const templateId = typeof templateRaw === "string" ? templateRaw : null;
  const { data: template } = templateId
    ? await supabase
        .from("sequence_templates")
        .select("id, name, description, steps")
        .eq("id", templateId)
        .maybeSingle()
    : { data: null };

  const client = Array.isArray(campaign.client) ? campaign.client[0] : campaign.client;
  const audience = Array.isArray(campaign.audience) ? campaign.audience[0] : campaign.audience;
  const leadBuckets = new Map<string, number>();
  for (const r of (leadStats ?? []) as Array<{ status: string | null }>) {
    const key = r.status ?? "unknown";
    leadBuckets.set(key, (leadBuckets.get(key) ?? 0) + 1);
  }
  const totalLeads = leadStats?.length ?? 0;
  const pushable = (leadBuckets.get("new") ?? 0) + (leadBuckets.get("queued") ?? 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to campaigns
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{campaign.name}</h1>
            <Badge variant={STATUS_VARIANT[campaign.status] ?? "secondary"}>{campaign.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {client ? (
              <Link href={`/clients/${client.id}`} className="hover:text-brand-500">
                {client.name}
              </Link>
            ) : (
              "Unassigned client"
            )}
            {audience ? <> · {audience.name}</> : null}
            {campaign.instantly_campaign_id ? (
              <span className="ml-2 inline-flex items-center gap-1 font-mono text-xs">
                <ExternalLink className="size-3" />
                {campaign.instantly_campaign_id}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {campaign.status !== "archived" ? (
            <form action={syncCampaignStatsAction}>
              <input type="hidden" name="campaign_id" value={campaign.id} />
              <Button variant="outline" size="sm" type="submit">
                <RefreshCw className="size-4" /> Sync stats
              </Button>
            </form>
          ) : null}
          {campaign.status !== "archived" ? (
            <form action={archiveCampaignAction}>
              <input type="hidden" name="campaign_id" value={campaign.id} />
              <Button variant="outline" size="sm" type="submit">
                <Archive className="size-4" /> Archive
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {!campaign.instantly_campaign_id ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instantly campaign not created yet</CardTitle>
            <CardDescription>
              The worker will pick up the <code className="font-mono text-xs">instantly_create_campaign</code> job on the
              next tick (every 10s). If it&apos;s been a while, trigger a retry.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={retryCreateInstantlyCampaignAction}>
              <input type="hidden" name="campaign_id" value={campaign.id} />
              <Button type="submit" variant="outline" size="sm">
                Retry create
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Sent" value={kpis?.sent ?? 0} />
        <KpiCard label="Opened" value={kpis?.opened ?? 0} suffix={kpis?.open_rate_pct != null ? `${kpis.open_rate_pct}%` : undefined} />
        <KpiCard label="Replies" value={kpis?.replied ?? 0} suffix={kpis?.reply_rate_pct != null ? `${kpis.reply_rate_pct}%` : undefined} />
        <KpiCard label="Positive" value={kpis?.positive_replied ?? 0} suffix={kpis?.positive_rate_pct != null ? `${kpis.positive_rate_pct}%` : undefined} />
        <KpiCard label="Meetings" value={kpis?.meetings ?? 0} />
        <KpiCard label="Bounced" value={kpis?.bounced ?? 0} />
        <KpiCard label="Unsubs" value={kpis?.unsubscribed ?? 0} />
        <KpiCard
          label="Spend"
          value={kpis?.usd_cost != null ? `$${Number(kpis.usd_cost).toFixed(2)}` : "$0.00"}
          suffix={kpis?.usd_per_reply != null ? `$${Number(kpis.usd_per_reply).toFixed(2)}/reply` : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leads</CardTitle>
          <CardDescription>
            {totalLeads} total · {pushable} pushable (new + queued) · last synced{" "}
            {syncState?.last_sync_at ? formatRelative(syncState.last_sync_at) : "never"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PushLeadsPanel
            campaignId={campaign.id}
            pushable={pushable}
            canPush={Boolean(campaign.instantly_campaign_id) && campaign.status !== "archived"}
          />
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {[...leadBuckets.entries()].sort().map(([status, count]) => (
              <Badge key={status} variant="secondary" className="font-mono">
                {status}: {count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {template ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sequence · {template.name}</CardTitle>
            {template.description ? (
              <CardDescription>{template.description}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              {Array.isArray(template.steps)
                ? (template.steps as Array<{ step: number; delay_days: number; subject: string; body: string }>).map(
                    (s) => (
                      <li key={s.step} className="rounded-md border bg-muted/30 p-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">+{s.delay_days}d</span>
                          <span className="font-medium uppercase tracking-wide">step {s.step}</span>
                        </div>
                        <p className="mt-1 font-medium">{s.subject}</p>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{s.body}</p>
                      </li>
                    ),
                  )
                : null}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <p className="pt-4 text-xs text-muted-foreground">
        Created {formatRelative(campaign.created_at)} · Last updated {formatRelative(campaign.updated_at)}
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{value}</p>
      {suffix ? <p className="mt-0.5 text-xs text-muted-foreground">{suffix}</p> : null}
    </div>
  );
}
