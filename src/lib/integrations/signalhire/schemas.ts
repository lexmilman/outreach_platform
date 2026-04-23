import { z } from "zod";

export const SignalHireSearchRequestSchema = z.object({
  items: z.array(z.string()).min(1).max(100),
  callbackUrl: z.string().url(),
});

export const SignalHireAcceptedSchema = z.object({
  requestId: z.string(),
});

export const SignalHireCallbackItemSchema = z.object({
  item: z.string(),
  status: z.enum(["success", "failed", "credits_are_over", "timeout_exceeded", "duplicate_query"]),
  candidate: z
    .object({
      fullName: z.string().optional(),
      emails: z
        .array(z.object({ value: z.string().email(), type: z.string().optional() }))
        .optional(),
      phones: z.array(z.object({ value: z.string() })).optional(),
      linkedinUrl: z.string().url().optional(),
    })
    .optional()
    .nullable(),
});

export const SignalHireCallbackSchema = z.array(SignalHireCallbackItemSchema);
export type SignalHireCallbackItem = z.infer<typeof SignalHireCallbackItemSchema>;
