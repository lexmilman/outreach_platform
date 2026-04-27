"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/current-org";
import { enqueueJob } from "@/lib/queue/dispatch";

export type EnrichResult = {
  ok: boolean;
  enqueued: number;
  skipped: number;
  errors?: string[];
};

const PersonIdsSchema = z.object({
  audienceId: z.string().uuid(),
  personIds: z.array(z.string().uuid()).min(1).max(200),
});

const PerplexityInputSchema = z.object({
  audienceId: z.string().uuid(),
  personId: z.string().uuid(),
  query: z.string().trim().min(3).max(2000),
});

const ScoreInputSchema = z.object({
  audienceId: z.string().uuid(),
  personIds: z.array(z.string().uuid()).min(1).max(200),
  campaignId: z.string().uuid(),
});

function summary(enqueued: number, skipped: number, errors: string[]): EnrichResult {
  return {
    ok: enqueued > 0 || (skipped === 0 && errors.length === 0),
    enqueued,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ---------- Apify person profiles ----------

export async function runEnrichPersonApify(input: {
  audienceId: string;
  personIds: string[];
}): Promise<EnrichResult> {
  const parsed = PersonIdsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, enqueued: 0, skipped: 0, errors: ["invalid input"] };

  const orgId = await requireOrgId();
  const supabase = await createClient();

  const { data: people, error } = await supabase
    .from("people")
    .select("id, linkedin_url")
    .in("id", parsed.data.personIds)
    .not("linkedin_url", "is", null);
  if (error) return { ok: false, enqueued: 0, skipped: 0, errors: [error.message] };

  let enqueued = 0;
  const errors: string[] = [];
  for (const p of people ?? []) {
    const r = await enqueueJob({
      type: "enrich_person_apify",
      payload: { personId: p.id },
      orgId,
    });
    if (r.ok) enqueued++;
    else errors.push(`${p.id}: ${r.error}`);
  }
  const skipped = parsed.data.personIds.length - (people?.length ?? 0);
  revalidatePath(`/audiences/${parsed.data.audienceId}`);
  return summary(enqueued, skipped, errors);
}

// ---------- Apify post scraping ----------

export async function runScrapePosts(input: {
  audienceId: string;
  personIds: string[];
}): Promise<EnrichResult> {
  const parsed = PersonIdsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, enqueued: 0, skipped: 0, errors: ["invalid input"] };

  const orgId = await requireOrgId();
  const supabase = await createClient();

  const { data: people } = await supabase
    .from("people")
    .select("id, linkedin_url")
    .in("id", parsed.data.personIds)
    .not("linkedin_url", "is", null);

  let enqueued = 0;
  const errors: string[] = [];
  for (const p of people ?? []) {
    const r = await enqueueJob({
      type: "scrape_posts_apify",
      payload: { personId: p.id, limit: 20 },
      orgId,
    });
    if (r.ok) enqueued++;
    else errors.push(`${p.id}: ${r.error}`);
  }
  const skipped = parsed.data.personIds.length - (people?.length ?? 0);
  revalidatePath(`/audiences/${parsed.data.audienceId}`);
  return summary(enqueued, skipped, errors);
}

// ---------- Apify company profiles (resolved via people.current_company_id) ----------

export async function runEnrichCompanyApify(input: {
  audienceId: string;
  personIds: string[];
}): Promise<EnrichResult> {
  const parsed = PersonIdsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, enqueued: 0, skipped: 0, errors: ["invalid input"] };

  const orgId = await requireOrgId();
  const supabase = await createClient();

  const { data: people } = await supabase
    .from("people")
    .select("id, current_company_id")
    .in("id", parsed.data.personIds)
    .not("current_company_id", "is", null);

  const companyIds = Array.from(
    new Set((people ?? []).map((p) => p.current_company_id as string).filter(Boolean)),
  );
  if (companyIds.length === 0) {
    return { ok: false, enqueued: 0, skipped: parsed.data.personIds.length, errors: ["no companies linked to selected people"] };
  }

  const { data: companies } = await supabase
    .from("companies")
    .select("id, linkedin_url")
    .in("id", companyIds)
    .not("linkedin_url", "is", null);

  let enqueued = 0;
  const errors: string[] = [];
  for (const c of companies ?? []) {
    const r = await enqueueJob({
      type: "enrich_company_apify",
      payload: { companyId: c.id },
      orgId,
    });
    if (r.ok) enqueued++;
    else errors.push(`${c.id}: ${r.error}`);
  }
  const skipped = companyIds.length - (companies?.length ?? 0);
  revalidatePath(`/audiences/${parsed.data.audienceId}`);
  return summary(enqueued, skipped, errors);
}

// ---------- Email find (FindyMail tier 1, auto-escalates to SignalHire) ----------

export async function runFindEmail(input: {
  audienceId: string;
  personIds: string[];
}): Promise<EnrichResult> {
  const parsed = PersonIdsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, enqueued: 0, skipped: 0, errors: ["invalid input"] };

  const orgId = await requireOrgId();
  const supabase = await createClient();

  const { data: people } = await supabase
    .from("people")
    .select("id, linkedin_url")
    .in("id", parsed.data.personIds)
    .not("linkedin_url", "is", null);

  let enqueued = 0;
  const errors: string[] = [];
  for (const p of people ?? []) {
    const r = await enqueueJob({
      type: "find_email_findymail",
      payload: { personId: p.id },
      orgId,
    });
    if (r.ok) enqueued++;
    else errors.push(`${p.id}: ${r.error}`);
  }
  const skipped = parsed.data.personIds.length - (people?.length ?? 0);
  revalidatePath(`/audiences/${parsed.data.audienceId}`);
  return summary(enqueued, skipped, errors);
}

// ---------- Email verify ----------

export async function runVerifyEmail(input: {
  audienceId: string;
  personIds: string[];
}): Promise<EnrichResult> {
  const parsed = PersonIdsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, enqueued: 0, skipped: 0, errors: ["invalid input"] };

  const orgId = await requireOrgId();
  const supabase = await createClient();

  // Pick one email per person — prefer is_primary then most recent.
  const { data: emails } = await supabase
    .from("emails")
    .select("id, person_id, is_primary, created_at")
    .in("person_id", parsed.data.personIds)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });

  const seen = new Set<string>();
  const targets: string[] = [];
  for (const e of emails ?? []) {
    if (seen.has(e.person_id as string)) continue;
    seen.add(e.person_id as string);
    targets.push(e.id as string);
  }

  let enqueued = 0;
  const errors: string[] = [];
  for (const emailId of targets) {
    const r = await enqueueJob({
      type: "verify_email_instantly",
      payload: { emailId },
      orgId,
    });
    if (r.ok) enqueued++;
    else errors.push(`${emailId}: ${r.error}`);
  }
  const skipped = parsed.data.personIds.length - targets.length;
  revalidatePath(`/audiences/${parsed.data.audienceId}`);
  return summary(enqueued, skipped, errors);
}

// ---------- Score + auto-chained messages ----------

export async function runScoreAndGenerate(input: {
  audienceId: string;
  personIds: string[];
  campaignId: string;
}): Promise<EnrichResult> {
  const parsed = ScoreInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, enqueued: 0, skipped: 0, errors: ["invalid input"] };

  const orgId = await requireOrgId();
  const supabase = await createClient();

  // Confirm campaign belongs to this org.
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, client_id, audience_id, org_id")
    .eq("id", parsed.data.campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, enqueued: 0, skipped: 0, errors: ["campaign not found"] };

  // Ensure people_in_campaign rows exist for each personId. Insert missing
  // rows with a fresh UUID for each. RLS will reject anything outside the
  // operator's org.
  const { data: existing } = await supabase
    .from("people_in_campaign")
    .select("id, person_id")
    .eq("campaign_id", parsed.data.campaignId)
    .in("person_id", parsed.data.personIds);

  const havePicByPerson = new Map<string, string>();
  for (const row of existing ?? []) {
    havePicByPerson.set(row.person_id as string, row.id as string);
  }
  const missingIds = parsed.data.personIds.filter((id) => !havePicByPerson.has(id));

  if (missingIds.length > 0) {
    const { data: inserted, error: insertErr } = await supabase
      .from("people_in_campaign")
      .insert(
        missingIds.map((personId) => ({
          person_id: personId,
          campaign_id: parsed.data.campaignId,
          client_id: campaign.client_id,
          audience_id: campaign.audience_id ?? null,
          status: "new",
        })),
      )
      .select("id, person_id");
    if (insertErr) {
      return {
        ok: false,
        enqueued: 0,
        skipped: 0,
        errors: [`pic insert failed: ${insertErr.message}`],
      };
    }
    for (const r of inserted ?? []) {
      havePicByPerson.set(r.person_id as string, r.id as string);
    }
  }

  let enqueued = 0;
  const errors: string[] = [];
  for (const personId of parsed.data.personIds) {
    const picId = havePicByPerson.get(personId);
    if (!picId) {
      errors.push(`${personId}: no pic`);
      continue;
    }
    const r = await enqueueJob({
      type: "score_lead_llm",
      payload: { personInCampaignId: picId },
      orgId,
    });
    if (r.ok) enqueued++;
    else errors.push(`${personId}: ${r.error}`);
  }

  revalidatePath(`/audiences/${parsed.data.audienceId}`);
  revalidatePath(`/campaigns/${parsed.data.campaignId}`);
  return summary(enqueued, 0, errors);
}

// ---------- Custom Perplexity research (single lead) ----------

export async function runCustomResearch(input: {
  audienceId: string;
  personId: string;
  query: string;
}): Promise<EnrichResult> {
  const parsed = PerplexityInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, enqueued: 0, skipped: 0, errors: ["invalid input"] };

  const orgId = await requireOrgId();
  const r = await enqueueJob({
    type: "enrich_custom_perplexity",
    payload: { personId: parsed.data.personId, query: parsed.data.query },
    orgId,
  });
  revalidatePath(`/audiences/${parsed.data.audienceId}`);
  return r.ok
    ? { ok: true, enqueued: 1, skipped: 0 }
    : { ok: false, enqueued: 0, skipped: 0, errors: [r.error] };
}
