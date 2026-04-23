import "server-only";
import { generateObject, generateText } from "ai";
import type { z } from "zod";
import { registry, type SupportedProvider } from "./registry";
import { computeCost } from "./pricing";

export class LLMError extends Error {
  constructor(message: string, public provider: string, public model: string, public cause?: unknown) {
    super(message);
    this.name = "LLMError";
  }
}

export interface CallLLMInput<S extends z.ZodTypeAny = z.ZodTypeAny> {
  provider: SupportedProvider;
  model: string;
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  schema?: S;
}

export interface CallLLMResult<T> {
  data: T;
  usage: { input: number; output: number; cached: number; total: number };
  costUsd: number;
  latencyMs: number;
}

export async function callLLM<S extends z.ZodTypeAny>(
  input: CallLLMInput<S>,
): Promise<CallLLMResult<z.infer<S>>> {
  const started = Date.now();
  const model = registry.languageModel(`${input.provider}:${input.model}`);

  try {
    if (input.schema) {
      const res = await generateObject({
        model,
        schema: input.schema,
        system: input.system,
        prompt: input.prompt,
        temperature: input.temperature ?? 0.2,
        maxOutputTokens: input.maxOutputTokens ?? 1024,
      });
      return finalize(res.object, res.usage, input, started);
    }

    const res = await generateText({
      model,
      system: input.system,
      prompt: input.prompt,
      temperature: input.temperature ?? 0.2,
      maxOutputTokens: input.maxOutputTokens ?? 1024,
    });
    return finalize(res.text as z.infer<S>, res.usage, input, started);
  } catch (err) {
    throw new LLMError(
      err instanceof Error ? err.message : "LLM call failed",
      input.provider,
      input.model,
      err,
    );
  }
}

function finalize<T>(
  data: T,
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number; cachedInputTokens?: number } | undefined,
  input: { provider: string; model: string },
  started: number,
): CallLLMResult<T> {
  const inTok = usage?.inputTokens ?? 0;
  const outTok = usage?.outputTokens ?? 0;
  const cachedTok = usage?.cachedInputTokens ?? 0;
  return {
    data,
    usage: { input: inTok, output: outTok, cached: cachedTok, total: inTok + outTok },
    costUsd: computeCost({
      provider: input.provider,
      model: input.model,
      inputTokens: inTok,
      outputTokens: outTok,
      cachedTokens: cachedTok,
    }),
    latencyMs: Date.now() - started,
  };
}
