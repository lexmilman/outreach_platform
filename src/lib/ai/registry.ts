import "server-only";
import { createProviderRegistry } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { xai } from "@ai-sdk/xai";
import { perplexity } from "@ai-sdk/perplexity";

export const registry = createProviderRegistry({
  openai,
  anthropic,
  google,
  xai,
  perplexity,
});

export type SupportedProvider = "openai" | "anthropic" | "google" | "xai" | "perplexity";
