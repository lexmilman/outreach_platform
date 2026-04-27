// @ts-nocheck
// Worker handler for enrich_custom_perplexity. Runs a free-form research
// query against Perplexity's Sonar models and stores the result on the
// person's data_json + enrichments audit trail.

import type { createAdminClient } from "./supabase-admin.ts";
import { workerLog } from "./worker-log.ts";

type Supabase = ReturnType<typeof createAdminClient>;

const PERPLEXITY_BASE = "https://api.perplexity.ai";
const DEFAULT_MODEL = "sonar-pro";

// Sonar pricing (USD / 1M tokens). Match src/lib/ai/pricing.ts.
const PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "sonar":     { inputPerMillion: 1, outputPerMillion: 1 },
  "sonar-pro": { inputPerMillion: 3, outputPerMillion: 15 },
};

export async function handleEnrichCustomPerplexity(
  supabase: Supabase,
  payload: { personId: string; query: string; model?: string },
  orgId: string,
) {
  const { data: person, error } = await supabase
    .from("people")
    .select("id, full_name")
    .eq("id", payload.personId)
    .single();
  if (error || !person) throw new Error(`person ${payload.personId} not found`);

  const apiKey = Deno.env.get("PERPLEXITY_API_KEY");
  const isMock = Deno.env.get("MOCK_PERPLEXITY") === "1" || !apiKey;

  const { data: enrichment } = await supabase
    .from("enrichments")
    .insert({
      org_id: orgId,
      person_id: person.id,
      provider: "perplexity",
      endpoint: "chat/completions",
      request_payload: { query: payload.query, model: payload.model ?? DEFAULT_MODEL, mock: isMock },
      outcome: "pending",
    })
    .select("id")
    .single();

  if (isMock) {
    const stubContent = `[MOCK] Research stub for: ${payload.query.slice(0, 80)}`;
    await supabase.rpc("perplexity_finalize", {
      p_enrichment_id: enrichment.id,
      p_content: stubContent,
      p_citations: ["https://example.com/mock-source"],
      p_run_cost_usd: 0,
    });
    return { length: stubContent.length, citations: 1, costUsd: 0, mock: true };
  }

  const model = payload.model ?? DEFAULT_MODEL;
  const res = await fetch(`${PERPLEXITY_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a senior B2B research analyst. Answer the user's question " +
            "concisely. Cite specific sources. Avoid speculation.",
        },
        { role: "user", content: `Subject: ${person.full_name ?? "(unknown)"}\n\n${payload.query}` },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await supabase
      .from("enrichments")
      .update({ outcome: "error", error_message: `perplexity ${res.status}: ${text.slice(0, 200)}` })
      .eq("id", enrichment.id);
    throw new Error(`perplexity ${res.status}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    citations?: string[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  const citations = json.citations ?? [];

  const usage = json.usage ?? {};
  const price = PRICING[model] ?? PRICING["sonar-pro"];
  const cost =
    ((usage.prompt_tokens ?? 0) / 1_000_000) * price.inputPerMillion +
    ((usage.completion_tokens ?? 0) / 1_000_000) * price.outputPerMillion;

  await supabase.rpc("perplexity_finalize", {
    p_enrichment_id: enrichment.id,
    p_content: content,
    p_citations: citations,
    p_run_cost_usd: Number(cost.toFixed(6)),
  });

  return { length: content.length, citations: citations.length, costUsd: cost };
}
