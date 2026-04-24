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

  // In MOCK mode no webhook will ever land, so we finalize here with a stub
  // response. Lets the full pipeline (auto-chain to email-finder, etc.)
  // exercise without the operator paying Apify.
  if (run.mock) {
    const stubItem = buildMockDatasetItem(args.actorKind);
    if (args.actorKind === "personProfile") {
      await supabase.rpc("apify_finalize_person", {
        p_enrichment_id: enrichment.id,
        p_item: stubItem,
        p_run_cost_usd: 0,
      });
    } else if (args.actorKind === "companyProfile") {
      await supabase.rpc("apify_finalize_company", {
        p_enrichment_id: enrichment.id,
        p_item: stubItem,
        p_run_cost_usd: 0,
      });
    } else if (args.actorKind === "profilePosts") {
      await supabase.rpc("apify_finalize_posts", {
        p_enrichment_id: enrichment.id,
        p_items: [stubItem],
        p_run_cost_usd: 0,
      });
    }
    // Auto-chain follow-up for person enrichment (mirrors real webhook behavior).
    if (args.actorKind === "personProfile" && args.personId) {
      await supabase.rpc("pgmq_send", {
        queue_name: "jobs",
        msg: {
          type: "find_email_findymail",
          payload: { personId: args.personId },
          org_id: args.orgId,
          job_id: crypto.randomUUID(),
        },
      });
    }
  }

  return {
    runId: run.runId,
    datasetId: run.datasetId,
    enrichmentId: enrichment.id,
    mock: run.mock ?? false,
  };
}

function buildMockDatasetItem(kind: ApifyActorKey): Record<string, unknown> {
  if (kind === "personProfile") {
    return {
      linkedinUrl: "https://www.linkedin.com/in/mock-prospect",
      firstName: "Mock",
      lastName: "Prospect",
      fullName: "Mock Prospect",
      headline: "[MOCK] VP Engineering at Acme Corp",
      about: "[MOCK] Placeholder about — replace with real Apify run.",
      location: "San Francisco Bay Area",
      country: "US",
      currentPosition: "VP of Engineering",
      companyName: "Acme Corp",
      companyLinkedinUrl: "https://www.linkedin.com/company/acme",
      companyWebsite: "https://acme.com",
      succeeded: true,
    };
  }
  if (kind === "companyProfile") {
    return {
      linkedinUrl: "https://www.linkedin.com/company/acme",
      name: "Acme Corp",
      tagline: "[MOCK] Building platforms at scale",
      description: "[MOCK] Placeholder company description.",
      industry: "Software Development",
      employeeCount: 250,
      website: "https://acme.com",
      hqCity: "San Francisco",
      hqCountry: "United States",
      succeeded: true,
    };
  }
  return {
    authorLinkedinUrl: "https://www.linkedin.com/in/mock-prospect",
    postUrl: "https://www.linkedin.com/feed/update/urn:li:activity:mock",
    postedAt: new Date().toISOString(),
    text: "[MOCK] Sample LinkedIn post content for fixture purposes.",
    likes: 42,
    comments: 7,
    reshares: 3,
  };
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
