import { z } from "zod";

export const CampaignNameSchema = z.string().trim().min(2, "Name is too short").max(120);

export const CampaignCreateSchema = z.object({
  name: CampaignNameSchema,
  client_id: z.string().uuid("Pick a client"),
  audience_id: z.string().uuid().optional().nullable(),
  sequence_template_id: z.string().uuid("Pick a sequence template"),
});
export type CampaignCreateInput = z.infer<typeof CampaignCreateSchema>;

export const CampaignPushSchema = z.object({
  campaign_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});
