// @ts-nocheck
// Worker handlers for Apify-backed jobs. Each one:
//   1. Loads the target row (person/company) from Postgres.
//   2. Inserts a pending `enrichments` row so the webhook has somewhere to land.
//   3. Kicks off an Apify actor run with a webhook back to /webhooks-apify.
//   4. Stores the runId on the enrichment row for later lookup.
// Heavy lifting (dataset → people/companies upsert, cost finalization, follow-ups)
// happens inside the webhook, NOT here.

import { startActorRun, type ApifyActorKey } from "./apify.ts";
import type { createAdminClient } from "./supabase-admin.ts";

type Supabase = ReturnType<typeof createAdminClient>;

function callbackUrl(): string {
  const base = Deno.env.get("SUPABASE_URL");
  if (!base) throw new Error("SUPABASE_URL not set");
  return `${base}/functions/v1/webhooks-apify`;
}

function callbackSecret(): string {
  const s = Deno.env.get("APIFY_WEBHOOK_SECRET");
  if (!s) throw new Error("APIFY_WEBHOOK_SECRET not set");
  return s;
}

async function startAndRecord(
  supabase: Supabase,
  args: {
    orgId: string;
    actorKind: ApifyActorKey;
    body: Record<string, unknown>;
    personId?: string;
    companyId?: string;
  },
) {
  const { data: enrichment, error: insErr } = await supabase
    .from("enrichments")
    .insert({
      org_id: args.orgId,
      person_id: args.personId ?? null,
      company_id: args.companyId ?? null,
      provider: "apify",
      endpoint: args.actorKind,
      request_payload: { actor_kind: args.actorKind, body: args.body },
      outcome: "pending",
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`enrichment insert failed: ${insErr.message}`);

  const run = await startActorRun({
    actor: args.actorKind,
    body: args.body,
    webhookUrl: callbackUrl(),
    webhookSecret: callbackSecret(),
  });
  if (!run.ok) {
    await supabase
      .from("enrichments")
      .update({ outcome: "error", error_message: run.error })
      .eq("id", enrichment.id);
    throw new Error(run.error);
  }

  await supabase
    .from("enrichments")
    .update({ provider_request_id: run.runId })
    .eq("id", enrichment.id);

  return { runId: run.runId, datasetId: run.datasetId, enrichmentId: enrichment.id };
}

export async function handleEnrichPersonApify(
  supabase: Supabase,
  payload: { personId: string },
  orgId: string,
) {
  const { data: person, error } = await supabase
    .from("people")
    .select("id, linkedin_url")
    .eq("id", payload.personId)
    .single();
  if (error || !person) throw new Error(`person ${payload.personId} not found`);
  if (!person.linkedin_url) throw new Error(`person ${payload.personId} has no linkedin_url`);

  return startAndRecord(supabase, {
    orgId,
    actorKind: "personProfile",
    body: { profileUrls: [person.linkedin_url] },
    personId: person.id,
  });
}

export async function handleEnrichCompanyApify(
  supabase: Supabase,
  payload: { companyId: string },
  orgId: string,
) {
  const { data: company, error } = await supabase
    .from("companies")
    .select("id, linkedin_url")
    .eq("id", payload.companyId)
    .single();
  if (error || !company) throw new Error(`company ${payload.companyId} not found`);
  if (!company.linkedin_url) throw new Error(`company ${payload.companyId} has no linkedin_url`);

  return startAndRecord(supabase, {
    orgId,
    actorKind: "companyProfile",
    body: { companyUrls: [company.linkedin_url] },
    companyId: company.id,
  });
}

export async function handleScrapePostsApify(
  supabase: Supabase,
  payload: { personId: string; limit?: number },
  orgId: string,
) {
  const { data: person, error } = await supabase
    .from("people")
    .select("id, linkedin_url")
    .eq("id", payload.personId)
    .single();
  if (error || !person) throw new Error(`person ${payload.personId} not found`);
  if (!person.linkedin_url) throw new Error(`person ${payload.personId} has no linkedin_url`);

  return startAndRecord(supabase, {
    orgId,
    actorKind: "profilePosts",
    body: {
      profileUrls: [person.linkedin_url],
      maxPosts: payload.limit ?? 20,
    },
    personId: person.id,
  });
}
