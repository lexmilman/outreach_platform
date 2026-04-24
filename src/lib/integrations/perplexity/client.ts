import "server-only";
import { serverEnv } from "@/lib/env.server";
import { ValidationError, fetchWithRetry } from "../_shared/http";
import type { IntegrationResult } from "../_shared/result";
import { computeCost } from "@/lib/ai/pricing";
import { PerplexityResponseSchema, type PerplexityModel } from "./schemas";

const BASE = "https://api.perplexity.ai";

function isMock(env = serverEnv()): boolean {
  return env.MOCK_PERPLEXITY === "1" || !env.PERPLEXITY_API_KEY;
}

export async function chat(input: {
  model: PerplexityModel;
  system?: string;
  prompt: string;
  temperature?: number;
  searchDomainFilter?: string[];
  searchRecencyFilter?: "hour" | "day" | "week" | "month" | "year";
  responseJsonSchema?: Record<string, unknown>;
}): Promise<IntegrationResult<{ content: string; citations?: string[] }>> {
  const env = serverEnv();
  if (isMock(env)) {
    return {
      ok: true,
      data: {
        content: `[mock] research summary for: ${input.prompt.slice(0, 60)}`,
        citations: ["https://example.com/mock-source"],
      },
      costUsd: 0,
      provider: "perplexity",
      latencyMs: 0,
      meta: { mock: true },
    };
  }

  const started = Date.now();
  const body = {
    model: input.model,
    messages: [
      ...(input.system ? [{ role: "system", content: input.system }] : []),
      { role: "user", content: input.prompt },
    ],
    temperature: input.temperature ?? 0.2,
    ...(input.searchDomainFilter ? { search_domain_filter: input.searchDomainFilter } : {}),
    ...(input.searchRecencyFilter ? { search_recency_filter: input.searchRecencyFilter } : {}),
    ...(input.responseJsonSchema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: { schema: input.responseJsonSchema },
          },
        }
      : {}),
  };

  const res = await fetchWithRetry(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify(body),
  }, { provider: "perplexity" });

  const json = await res.json();
  const parsed = PerplexityResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: new ValidationError("Perplexity response shape changed", "perplexity", parsed.error.issues),
    };
  }

  const content = parsed.data.choices[0]?.message.content ?? "";
  const usage = parsed.data.usage;
  const costUsd = usage
    ? computeCost({
        provider: "perplexity",
        model: input.model,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
      })
    : 0;
  return {
    ok: true,
    data: { content, citations: parsed.data.citations },
    costUsd,
    provider: "perplexity",
    latencyMs: Date.now() - started,
  };
}
