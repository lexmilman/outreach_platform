import Link from "next/link";
import { ArrowUpRight, Briefcase, Mail, Sparkles, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ count: clientCount }, { count: campaignCount }] = await Promise.all([
    supabase.from("clients").select("*", { head: true, count: "exact" }),
    supabase.from("campaigns").select("*", { head: true, count: "exact" }),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Welcome back.
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cold outreach automation, for every client, all from here.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Stat label="Clients" value={clientCount ?? 0} icon={Briefcase} href="/clients" />
        <Stat label="Campaigns" value={campaignCount ?? 0} icon={Mail} href="/campaigns" />
        <Stat label="People in DB" value="—" icon={Users} href="/people" />
        <Stat label="Sent (7d)" value="—" icon={Sparkles} href="/analytics" />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              You're a few steps from your first campaign.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Step n={1} title="Create a client" href="/clients/new" done={Boolean(clientCount)} />
            <Step n={2} title="Import an audience (CSV)" href="/audiences/import" />
            <Step n={3} title="Run enrichment + scoring" href="/campaigns" />
            <Step n={4} title="Push to Instantly" href="/campaigns" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Job runs + replies — live.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            No activity yet. As soon as you kick off a campaign, things show up here.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: number | string;
  icon: typeof Briefcase;
  href: string;
}) {
  return (
    <Card className="group transition-colors hover:border-brand-500/40">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <span className="font-display text-3xl font-semibold">{value}</span>
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-brand-500"
        >
          View <ArrowUpRight className="size-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

function Step({ n, title, href, done }: { n: number; title: string; href: string; done?: boolean }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md border bg-card/60 px-3 py-2 transition-colors hover:border-brand-500/40"
    >
      <span
        className={
          done
            ? "flex size-6 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-600"
            : "flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
        }
      >
        {done ? "✓" : n}
      </span>
      <span className="flex-1">{title}</span>
      <Button variant="ghost" size="sm" asChild>
        <span>Open</span>
      </Button>
    </Link>
  );
}
