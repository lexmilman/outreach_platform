import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { NewCampaignForm } from "./new-campaign-form";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const supabase = await createClient();
  const [{ data: clients }, { data: templates }, { data: audiences }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("is_archived", false)
      .order("name", { ascending: true }),
    supabase
      .from("sequence_templates")
      .select("id, name, description, steps, is_default")
      .order("is_default", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("audiences")
      .select("id, name, client_id")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to campaigns
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>New campaign</CardTitle>
          <CardDescription>
            Choose a client, a sequence template, and optionally an audience. Leadflow creates the Instantly
            campaign for you, then you push leads from the campaign page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!clients || clients.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              You need at least one client first. <Link href="/clients/new" className="text-brand-500 hover:underline">Create a client</Link>.
            </div>
          ) : !templates || templates.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No sequence templates found. Run{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">
                select public.bootstrap_sequence_templates();
              </code>{" "}
              in the Supabase SQL Editor to seed the stock template.
            </div>
          ) : (
            <NewCampaignForm
              clients={clients}
              templates={templates}
              audiences={audiences ?? []}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
