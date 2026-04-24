import { z } from "zod";

export const ScoringResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  tier: z.enum(["high", "mid", "low"]),
  reasons: z.array(z.string().min(3).max(240)).min(1).max(5),
});
export type ScoringResult = z.infer<typeof ScoringResultSchema>;

export const MessageBodySchema = z.object({
  step: z.number().int().min(1).max(4),
  body: z.string().min(40).max(2000),
});

export const MessagesResultSchema = z.object({
  subject: z.string().min(3).max(120),
  bodies: z.array(MessageBodySchema).length(4),
  personalization: z.string().min(10).max(800),
});
export type MessagesResult = z.infer<typeof MessagesResultSchema>;
