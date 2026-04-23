import "server-only";
import { z } from "zod";

const ServerEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  APIFY_TOKEN: z.string().optional(),
  APIFY_WEBHOOK_SECRET: z.string().optional(),
  FINDYMAIL_API_KEY: z.string().optional(),
  SIGNALHIRE_API_KEY: z.string().optional(),
  SIGNALHIRE_CALLBACK_SECRET: z.string().optional(),
  INSTANTLY_API_KEY: z.string().optional(),
  INSTANTLY_WEBHOOK_SECRET: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  XAI_API_KEY: z.string().optional(),

  SUPABASE_CRON_SECRET: z.string().optional(),

  MOCK_APIFY: z.enum(["0", "1"]).optional(),
  MOCK_FINDYMAIL: z.enum(["0", "1"]).optional(),
  MOCK_SIGNALHIRE: z.enum(["0", "1"]).optional(),
  MOCK_INSTANTLY: z.enum(["0", "1"]).optional(),
  MOCK_PERPLEXITY: z.enum(["0", "1"]).optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid server env:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid server environment");
  }
  cached = parsed.data;
  return cached;
}
