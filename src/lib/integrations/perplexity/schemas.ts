import { z } from "zod";

export const PerplexityModelSchema = z.enum(["sonar", "sonar-pro", "sonar-deep-research"]);
export type PerplexityModel = z.infer<typeof PerplexityModelSchema>;

export const PerplexityMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export const PerplexityResponseSchema = z
  .object({
    id: z.string(),
    model: z.string(),
    choices: z.array(
      z.object({
        index: z.number().int(),
        message: z.object({ role: z.string(), content: z.string() }),
        finish_reason: z.string().optional(),
      }),
    ),
    usage: z
      .object({
        prompt_tokens: z.number().int(),
        completion_tokens: z.number().int(),
        total_tokens: z.number().int(),
      })
      .optional(),
    citations: z.array(z.string()).optional(),
  })
  .passthrough();
export type PerplexityResponse = z.infer<typeof PerplexityResponseSchema>;
