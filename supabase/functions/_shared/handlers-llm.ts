// @ts-nocheck
// Worker handlers for LLM-backed jobs:
//   - score_lead_llm
//   - generate_messages_llm
//
// Both load the same input bundle via llm_input_for_pic RPC, render a prompt
// (Handlebars-lite), call Anthropic with prompt caching on the system block,
// validate the JSON result, then finalize via SECURITY DEFINER RPC.

import { z } from "https://esm.sh/zod@3.23.8";
import { callAnthropicJson } from "./llm.ts";
import type { createAdminClient } from "./supabase-admin.ts";

type Supabase = ReturnType<typeof createAdminClient>;

// ---------- Models per feature (default fallback) ----------

const DEFAULT_MODEL_SCORING = "claude-haiku-4-5";
const DEFAULT_MODEL_MESSAGES = "claude-sonnet-4-6";

async function modelFor(supabase: Supabase, orgId: string, feature: "scoring" | "messages"): Promise<string> {
  const { data } = await supabase
    .from("llm_providers_config")
    .select("model")
    .eq("org_id", orgId)
    .eq("feature", feature)
    .maybeSingle();
  if (data?.model) return data.model;
  return feature === "scoring" ? DEFAULT_MODEL_SCORING : DEFAULT_MODEL_MESSAGES;
}

// ---------- Prompt loading ----------

type PromptTemplate = { id: string | null; system: string; user: string };

const DEFAULT_RELEVANCE: PromptTemplate = {
  id: null,
  system: `You are a B2B sales relevance scorer.
Given a prospect (LinkedIn profile + company info) and an Ideal Customer
Profile (ICP), output a JSON object with:
  - score: integer 0-100 (likelihood this prospect matches the ICP)
  - tier: "high" (>=70), "mid" (40-69), or "low" (<40)
  - reasons: array of 3-5 short bullet strings explaining your score

Be strict. Penalize generic titles, junior seniority, or industry mismatch.
Reward decision-maker titles, ICP keywords in the headline/about/company.

Output ONLY a single JSON object. No markdown, no commentary.`,
  user: `# ICP
{{icp_description}}

# Prospect
- Name: {{full_name}}
- Title: {{current_title}}
- Headline: {{headline}}
- About: {{about}}
- Location: {{location}}

# Company
- Name: {{company_name}}
- Industry: {{company_industry}}
- Description: {{company_description}}

Return JSON only.`,
};

const DEFAULT_MESSAGES: PromptTemplate = {
  id: null,
  system: `You are an outbound copywriter generating a 4-step cold email sequence
for a B2B prospect. Voice and tone come from the brand voice below.

Output a single JSON object with:
  - subject: a single subject line for the whole sequence (3-9 words, no
    emoji, no clickbait)
  - bodies: array of EXACTLY 4 objects { step: 1|2|3|4, body: "..." }
    * step 1: first-touch, 80-120 words, references something specific
      from the prospect's profile or company
    * step 2: short bump (40-70 words), surface 1 concrete value point
    * step 3: short story / mini case study (60-100 words)
    * step 4: break-up email (40-60 words), polite, leaves the door open
  - personalization: 1-2 sentence summary of WHY this prospect was chosen
    and which hook each step uses

Hard rules: no merge tags, no curly braces, no "I hope this email finds you
well", no "Quick question". Lead with insight or specificity. Plain text only.

Output ONLY a single JSON object. No markdown, no commentary.`,
  user: `# Brand voice
{{brand_voice}}

# ICP
{{icp_description}}

# Prospect
- Name: {{full_name}}
- Title: {{current_title}}
- Headline: {{headline}}
- About: {{about}}

# Company
- Name: {{company_name}}
- Industry: {{company_industry}}
- Description: {{company_description}}

# Recent posts (optional)
{{last_posts}}

Return JSON only.`,
};

async function loadActivePrompt(
  supabase: Supabase,
  clientId: string,
  kind: "relevance" | "messages",
): Promise<PromptTemplate> {
  // Find the org's active prompt_version for this (client, kind).
  const { data } = await supabase
    .from("prompt_versions")
    .select("id, system_template, user_template, prompts!inner(client_id, kind)")
    .eq("is_active", true)
    .eq("prompts.client_id", clientId)
    .eq("prompts.kind", kind)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.system_template && data?.user_template) {
    return {
      id: data.id,
      system: data.system_template,
      user: data.user_template,
    };
  }
  return kind === "relevance" ? DEFAULT_RELEVANCE : DEFAULT_MESSAGES;
}

// ---------- Mustache-lite renderer ----------
// Only `{{var}}` substitution. Empty/null vars render as empty string.
function render(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    return JSON.stringify(v);
  });
}

// ---------- Schemas ----------

const ScoringSchema = z.object({
  score: z.number().int().min(0).max(100),
  tier: z.enum(["high", "mid", "low"]),
  reasons: z.array(z.string().min(3).max(240)).min(1).max(5),
});

const MessagesSchema = z.object({
  subject: z.string().min(3).max(120),
  bodies: z
    .array(
      z.object({
        step: z.number().int().min(1).max(4),
        body: z.string().min(40).max(2000),
      }),
    )
    .length(4),
  personalization: z.string().min(10).max(800),
});

// ---------- Input loader ----------

type LlmInput = {
  pic_id: string;
  org_id: string;
  client_id: string;
  campaign_id: string;
  person_id: string;
  full_name: string | null;
  current_title: string | null;
  headline: string | null;
  about: string | null;
  location: string | null;
  posts: unknown;
  company_name: string | null;
  company_industry: string | null;
  company_description: string | null;
  icp_description: string | null;
  brand_voice: string | null;
};

async function loadInput(supabase: Supabase, picId: string): Promise<LlmInput> {
  const { data, error } = await supabase
    .rpc("llm_input_for_pic", { p_pic_id: picId })
    .single();
  if (error || !data) throw new Error(`llm_input_for_pic failed for ${picId}: ${error?.message ?? "no row"}`);
  return data as LlmInput;
}

function vars(input: LlmInput) {
  const lastPosts = Array.isArray(input.posts)
    ? (input.posts as { text?: string }[])
        .slice(0, 3)
        .map((p, i) => `(${i + 1}) ${p.text ?? ""}`)
        .join("\n")
    : "";
  return {
    full_name: input.full_name ?? "",
    current_title: input.current_title ?? "",
    headline: input.headline ?? "",
    about: input.about ?? "",
    location: input.location ?? "",
    company_name: input.company_name ?? "",
    company_industry: input.company_industry ?? "",
    company_description: input.company_description ?? "",
    icp_description: input.icp_description ?? "",
    brand_voice: input.brand_voice ?? "",
    last_posts: lastPosts,
  };
}

// ---------- Handlers ----------

export async function handleScoreLeadLlm(
  supabase: Supabase,
  payload: { personInCampaignId: string },
  orgId: string,
) {
  const input = await loadInput(supabase, payload.personInCampaignId);
  const prompt = await loadActivePrompt(supabase, input.client_id, "relevance");
  const model = await modelFor(supabase, orgId, "scoring");

  const result = await callAnthropicJson({
    model,
    system: prompt.system,
    prompt: render(prompt.user, vars(input)),
    validate: (raw) => ScoringSchema.parse(raw),
    maxOutputTokens: 512,
    temperature: 0.1,
  });

  await supabase.rpc("score_lead_finalize", {
    p_pic_id: payload.personInCampaignId,
    p_score: result.data.score,
    p_tier: result.data.tier,
    p_reasons: result.data.reasons,
    p_prompt_version_id: prompt.id,
    p_run_cost_usd: result.costUsd,
  });

  // Auto-chain: if score >= 70, queue message generation.
  if (result.data.score >= 70) {
    await supabase.rpc("pgmq_send", {
      queue_name: "jobs",
      msg: {
        type: "generate_messages_llm",
        payload: { personInCampaignId: payload.personInCampaignId },
        org_id: orgId,
        job_id: crypto.randomUUID(),
      },
    });
  }

  return {
    score: result.data.score,
    tier: result.data.tier,
    costUsd: result.costUsd,
    cachedTokens: result.cachedTokens,
  };
}

export async function handleGenerateMessagesLlm(
  supabase: Supabase,
  payload: { personInCampaignId: string },
  orgId: string,
) {
  const input = await loadInput(supabase, payload.personInCampaignId);
  const prompt = await loadActivePrompt(supabase, input.client_id, "messages");
  const model = await modelFor(supabase, orgId, "messages");

  const result = await callAnthropicJson({
    model,
    system: prompt.system,
    prompt: render(prompt.user, vars(input)),
    validate: (raw) => MessagesSchema.parse(raw),
    maxOutputTokens: 2400,
    temperature: 0.4,
  });

  await supabase.rpc("generate_messages_finalize", {
    p_pic_id: payload.personInCampaignId,
    p_subject: result.data.subject,
    p_bodies: result.data.bodies,
    p_personalization: result.data.personalization,
    p_prompt_version_id: prompt.id,
    p_run_cost_usd: result.costUsd,
  });

  return {
    subject: result.data.subject,
    bodyCount: result.data.bodies.length,
    costUsd: result.costUsd,
    cachedTokens: result.cachedTokens,
  };
}
