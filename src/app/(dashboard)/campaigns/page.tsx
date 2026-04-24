import Link from "next/link";
import { Plus, ExternalLink } from "lucide-react";
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

const STATUS_VARIANT: Record<string, "secondary" | "success" | "default" | "destructive"> = {
  draft: "secondary",
  ready: "default",
  running: "success",
  paused: "secondary",
  completed: "secondary",
  archived: "destructive",
};

export default async function CampaignsPage() {
  const supabase = await createClient();
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select(`
      id, name, status, instantly_campaign_id, created_at, updated_at,
      client:clients(id, name),
      kpis:v_campaign_kpis(sent, replied, positive_replied, reply_rate_pct, usd_cost)
    `)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Instantly campaigns created from Leadflow. Each row links to a sequence, the audience, and the live KPIs.
          </p>
        </div>
        <Button asChild variant="brand">
          <Link href="/campaigns/new">
            <Plus className="size-4" /> New campaign
          </Link>
        </Button>
      </div>

      {!campaigns || campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <div className="size-12 rounded-lg bg-brand-gradient" aria-hidden />
          <h3 className="mt-4 font-display text-lg font-semibold">No campaigns yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Create your first campaign: pick a client, a sequence template, and we&apos;ll wire it up in Instantly.
          </p>
          <Button asChild variant="brand" className="mt-6">
            <Link href="/campaigns/new">
              <Plus className="size-4" /> Create campaign
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
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Replies</TableHead>
                <TableHead className="text-right">Reply rate</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => {
                const kpi = Array.isArray(c.kpis) ? c.kpis[0] : c.kpis;
                const client = Array.isArray(c.client) ? c.client[0] : c.client;
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="font-medium hover:text-brand-500"
                      >
                        {c.name}
                      </Link>
                      {c.instantly_campaign_id ? (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <ExternalLink className="size-3" />
                          {c.instantly_campaign_id.slice(0, 10)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {client ? (
                        <Link
                          href={`/clients/${client.id}`}
                          className="text-sm hover:text-brand-500"
                        >
                          {client.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[c.status] ?? "secondary"}>{c.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{kpi?.sent ?? 0}</TableCell>
                    <TableCell className="text-right font-mono">{kpi?.replied ?? 0}</TableCell>
                    <TableCell className="text-right font-mono">
                      {kpi?.reply_rate_pct != null ? `${kpi.reply_rate_pct}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {kpi?.usd_cost != null ? `$${Number(kpi.usd_cost).toFixed(2)}` : "$0.00"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatRelative(c.updated_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
