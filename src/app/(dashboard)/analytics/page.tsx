import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnalyticsClientFilter } from "./client-filter";

export const dynamic = "force-dynamic";

type SearchParams = { client?: string; from?: string; to?: string };

const ISO = (d: Date) => d.toISOString().slice(0, 10);

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 3600 * 1000);
  const from = params.from ?? ISO(thirtyDaysAgo);
  const to = params.to ?? ISO(today);
  const clientId = params.client && params.client.length > 0 ? params.client : null;

  const [{ data: clients }, summaryRes, campaignsRes, costRowsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("is_archived", false)
      .order("name", { ascending: true }),
    supabase.rpc("analytics_summary", {
      p_client_id: clientId,
      p_from: from,
      p_to: to,
    }),
    supabase
      .from("v_campaign_kpis")
      .select("campaign_id, campaign_name, campaign_status, client_id, sent, replied, positive_replied, reply_rate_pct, usd_cost")
      .order("usd_cost", { ascending: false })
      .limit(20),
    supabase
      .from("cost_tracking")
      .select("provider, usd_cost, day, client_id")
      .gte("day", from)
      .lte("day", to),
  ]);

  const summaryRow = (summaryRes.data as Array<{
    total_sent: number;
    total_opened: number;
    total_replied: number;
    total_positive: number;
    total_meetings: number;
    total_cost: number;
    open_rate_pct: number;
    reply_rate_pct: number;
    positive_rate_pct: number;
    usd_per_reply: number | null;
    provider_costs: Record<string, number> | null;
    daily_series: Array<{ day: string; sent: number; replied: number; positive: number }> | null;
  }> | null)?.[0] ?? null;

  const providerCosts = summaryRow?.provider_costs ?? {};
  const dailySeries = summaryRow?.daily_series ?? [];

  const campaigns = (campaignsRes.data ?? []).filter(
    (c) => !clientId || c.client_id === clientId,
  );

  const costsByProvider = new Map<string, number>();
  for (const r of (costRowsRes.data ?? []) as Array<{ provider: string; usd_cost: number; client_id: string | null }>) {
    if (clientId && r.client_id !== clientId) continue;
    costsByProvider.set(r.provider, (costsByProvider.get(r.provider) ?? 0) + Number(r.usd_cost));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Daily Instantly sync + cost tracking. Window: {from} → {to}.
          </p>
        </div>
        <AnalyticsClientFilter
          clients={clients ?? []}
          selectedClient={clientId}
          from={from}
          to={to}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Sent" value={summaryRow?.total_sent ?? 0} />
        <Kpi
          label="Opened"
          value={summaryRow?.total_opened ?? 0}
          suffix={summaryRow ? `${summaryRow.open_rate_pct}%` : undefined}
        />
        <Kpi
          label="Replies"
          value={summaryRow?.total_replied ?? 0}
          suffix={summaryRow ? `${summaryRow.reply_rate_pct}%` : undefined}
        />
        <Kpi
          label="Positive"
          value={summaryRow?.total_positive ?? 0}
          suffix={summaryRow ? `${summaryRow.positive_rate_pct}%` : undefined}
        />
        <Kpi label="Meetings" value={summaryRow?.total_meetings ?? 0} />
        <Kpi
          label="Spend"
          value={summaryRow ? `$${Number(summaryRow.total_cost).toFixed(2)}` : "$0.00"}
          suffix={summaryRow?.usd_per_reply != null ? `$${Number(summaryRow.usd_per_reply).toFixed(2)}/reply` : undefined}
        />
        <Kpi
          label="Providers"
          value={Object.keys(providerCosts).length}
          suffix="tracked"
        />
        <Kpi
          label="Days"
          value={dailySeries.length}
          suffix="with data"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Send volume — last {dailySeries.length} days</CardTitle>
            <CardDescription>Sent / Replied / Positive per day.</CardDescription>
          </CardHeader>
          <CardContent>
            {dailySeries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No snapshots yet. Run the sync to populate.</p>
            ) : (
              <DailyBars series={dailySeries} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost by provider</CardTitle>
            <CardDescription>Total USD spent in the selected window.</CardDescription>
          </CardHeader>
          <CardContent>
            {costsByProvider.size === 0 ? (
              <p className="text-sm text-muted-foreground">No cost tracked yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {[...costsByProvider.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([provider, usd]) => (
                    <li key={provider} className="flex items-center justify-between">
                      <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                        {provider}
                      </span>
                      <span className="font-mono">${usd.toFixed(4)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top campaigns by spend</CardTitle>
          <CardDescription>
            Each row is a live rollup from analytics_snapshots + cost_tracking.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {campaigns.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No campaigns to report.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Replied</TableHead>
                  <TableHead className="text-right">Positive</TableHead>
                  <TableHead className="text-right">Reply rate</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.campaign_id}>
                    <TableCell>
                      <Link
                        href={`/campaigns/${c.campaign_id}`}
                        className="font-medium hover:text-brand-500"
                      >
                        {c.campaign_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.campaign_status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{c.sent}</TableCell>
                    <TableCell className="text-right font-mono">{c.replied}</TableCell>
                    <TableCell className="text-right font-mono">{c.positive_replied}</TableCell>
                    <TableCell className="text-right font-mono">{c.reply_rate_pct}%</TableCell>
                    <TableCell className="text-right font-mono">${Number(c.usd_cost).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, suffix }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{value}</p>
      {suffix ? <p className="mt-0.5 text-xs text-muted-foreground">{suffix}</p> : null}
    </div>
  );
}

function DailyBars({
  series,
}: {
  series: Array<{ day: string; sent: number; replied: number; positive: number }>;
}) {
  const max = Math.max(1, ...series.map((s) => s.sent));
  return (
    <div className="space-y-1">
      {series.map((s) => {
        const sentPct = (s.sent / max) * 100;
        const repliedPct = (s.replied / max) * 100;
        const positivePct = (s.positive / max) * 100;
        return (
          <div key={s.day} className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 font-mono text-muted-foreground">{s.day.slice(5)}</span>
            <div className="relative h-5 flex-1 rounded-sm bg-muted/50">
              <div
                className="absolute inset-y-0 left-0 rounded-sm bg-brand-500/40"
                style={{ width: `${sentPct}%` }}
                title={`sent ${s.sent}`}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-sm bg-brand-500/80"
                style={{ width: `${repliedPct}%` }}
                title={`replied ${s.replied}`}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-sm bg-emerald-500/90"
                style={{ width: `${positivePct}%` }}
                title={`positive ${s.positive}`}
              />
            </div>
            <span className="w-16 text-right font-mono text-muted-foreground">
              {s.sent}/{s.replied}
            </span>
          </div>
        );
      })}
    </div>
  );
}
