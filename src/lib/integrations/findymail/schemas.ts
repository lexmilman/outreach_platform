import { z } from "zod";

export const FindyMailContactSchema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
  domain: z.string().optional(),
});
export type FindyMailContact = z.infer<typeof FindyMailContactSchema>;

export const FindyMailSearchLinkedinResponseSchema = z.object({
  contact: FindyMailContactSchema.nullable(),
});

export const FindyMailSearchNameResponseSchema = FindyMailSearchLinkedinResponseSchema;

export const FindyMailVerifyResponseSchema = z.object({
  email: z.string(),
  verified: z.boolean(),
  provider: z.string().optional(),
});
