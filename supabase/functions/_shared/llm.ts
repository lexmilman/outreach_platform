// @ts-nocheck
// Deno-side Anthropic API helper.
//
// Why not Vercel AI SDK: it's Node-only and the providers don't initialize
// in Deno. We hit /v1/messages directly with prompt caching on the system
// block. Output is requested as JSON and parsed with one retry on parse fail.

const ANTHROPIC_BASE = "https://api.anthropic.com/v1";

// Pricing snapshot for the models we actually call from Deno. Keep in sync
// with src/lib/ai/pricing.ts (Anthropic rows).
const PRICING: Record<string, {
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion: number;
}> = {
  "claude-opus-4-7":   { inputPerMillion: 15,  outputPerMillion: 75, cachedInputPerMillion: 1.5 },
  "claude-sonnet-4-6": { inputPerMillion: 3,   outputPerMillion: 15, cachedInputPerMillion: 0.3 },
  "claude-haiku-4-5":  { inputPerMillion: 0.8, outputPerMillion: 4,  cachedInputPerMillion: 0.08 },
};

export type LLMResult<T> = {
  data: T;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  latencyMs: number;
};

export async function callAnthropicJson<T>(input: {
  model: string;
  system: string;
  prompt: string;
  validate: (parsed: unknown) => T; // throws on invalid; e.g. zod's schema.parse
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<LLMResult<T>> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const started = Date.now();
  const body = {
    model: input.model,
    max_tokens: input.maxOutputTokens ?? 2048,
    temperature: input.temperature ?? 0.2,
    system: [
      {
        type: "text",
        text: input.system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: input.prompt }],
  };

  const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };

  const text = (json.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text!)
    .join("");

  // Strip ```json fences if present, then JSON.parse + validate.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // One naive recovery: take the substring between the first { and last }.
    const i = cleaned.indexOf("{");
    const j = cleaned.lastIndexOf("}");
    if (i >= 0 && j > i) {
      parsed = JSON.parse(cleaned.slice(i, j + 1));
    } else {
      throw new Error("LLM did not return valid JSON");
    }
  }

  const data = input.validate(parsed);

  const usage = json.usage ?? {};
  const inTok = usage.input_tokens ?? 0;
  const outTok = usage.output_tokens ?? 0;
  const cachedTok = (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  const price = PRICING[input.model];
  let costUsd = 0;
  if (price) {
    const billedInput = Math.max(0, inTok - cachedTok);
    costUsd =
      (billedInput / 1_000_000) * price.inputPerMillion +
      (cachedTok / 1_000_000) * price.cachedInputPerMillion +
      (outTok / 1_000_000) * price.outputPerMillion;
  }

  return {
    data,
    costUsd: Number(costUsd.toFixed(6)),
    inputTokens: inTok,
    outputTokens: outTok,
    cachedTokens: cachedTok,
    latencyMs: Date.now() - started,
  };
}
