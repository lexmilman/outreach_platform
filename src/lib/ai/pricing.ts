/**
 * Hard-coded USD pricing per 1M tokens. Reconcile against provider invoices monthly.
 * Keys: `${provider}:${model}`.
 */

export type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion?: number;
};

export const PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "anthropic:claude-opus-4-7": { inputPerMillion: 15, outputPerMillion: 75, cachedInputPerMillion: 1.5 },
  "anthropic:claude-sonnet-4-6": { inputPerMillion: 3, outputPerMillion: 15, cachedInputPerMillion: 0.3 },
  "anthropic:claude-haiku-4-5": { inputPerMillion: 0.8, outputPerMillion: 4, cachedInputPerMillion: 0.08 },

  // OpenAI
  "openai:gpt-4.1": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "openai:gpt-4.1-mini": { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  "openai:o4-mini": { inputPerMillion: 1.1, outputPerMillion: 4.4 },

  // Google
  "google:gemini-2.5-pro": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "google:gemini-2.5-flash": { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  "google:gemini-2.5-flash-lite": { inputPerMillion: 0.1, outputPerMillion: 0.4 },

  // xAI
  "xai:grok-4": { inputPerMillion: 5, outputPerMillion: 15 },
  "xai:grok-4-fast": { inputPerMillion: 0.2, outputPerMillion: 0.5 },

  // Perplexity (LLM path)
  "perplexity:sonar": { inputPerMillion: 1, outputPerMillion: 1 },
  "perplexity:sonar-pro": { inputPerMillion: 3, outputPerMillion: 15 },
};

export function computeCost(input: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}): number {
  const key = `${input.provider}:${input.model}`;
  const p = PRICING[key];
  if (!p) return 0;
  const inCost = ((input.inputTokens - (input.cachedTokens ?? 0)) / 1_000_000) * p.inputPerMillion;
  const cacheCost = ((input.cachedTokens ?? 0) / 1_000_000) * (p.cachedInputPerMillion ?? p.inputPerMillion);
  const outCost = (input.outputTokens / 1_000_000) * p.outputPerMillion;
  return Number((inCost + cacheCost + outCost).toFixed(6));
}
