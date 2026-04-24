import { z } from "zod";

export const InstantlyLeadCustomVariablesSchema = z.object({
  location: z.string().optional(),
  title: z.string().optional(),
  linkedin_url: z.string().url().optional(),
  subject: z.string().optional(),
  email_copy_1: z.string().optional(),
  email_copy_2: z.string().optional(),
  email_copy_3: z.string().optional(),
  email_copy_4: z.string().optional(),
  personalization: z.string().optional(),
  waterfall_lead_id: z.string().uuid().optional(),
  tier: z.number().int().min(1).max(5).optional(),
});
export type InstantlyLeadCustomVariables = z.infer<typeof InstantlyLeadCustomVariablesSchema>;

export const InstantlyLeadAddItemSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company_name: z.string().optional(),
  custom_variables: InstantlyLeadCustomVariablesSchema.optional(),
});
export type InstantlyLeadAddItem = z.infer<typeof InstantlyLeadAddItemSchema>;

export const InstantlyBulkAddRequestSchema = z.object({
  campaign_id: z.string(),
  leads: z.array(InstantlyLeadAddItemSchema),
});

export const InstantlySequenceStepSchema = z.object({
  step: z.number().int().min(1).max(10),
  delay_days: z.number().int().min(0).max(90),
  subject: z.string().min(1),
  body: z.string().min(1),
});
export type InstantlySequenceStep = z.infer<typeof InstantlySequenceStepSchema>;

export const InstantlyCampaignCreateRequestSchema = z.object({
  name: z.string().min(1).max(200),
  sequences: z.array(
    z.object({
      steps: z.array(InstantlySequenceStepSchema).min(1).max(10),
    }),
  ),
});
export type InstantlyCampaignCreateRequest = z.infer<typeof InstantlyCampaignCreateRequestSchema>;

export const InstantlyCampaignCreateResponseSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();

export const InstantlyAnalyticsOverviewSchema = z
  .object({
    campaign_id: z.string(),
    sent: z.number().int().default(0),
    opened: z.number().int().default(0),
    replied: z.number().int().default(0),
    bounced: z.number().int().default(0),
    unsubscribed: z.number().int().default(0),
    clicked: z.number().int().default(0),
    completed: z.number().int().default(0),
    total_interested: z.number().int().default(0),
    total_meeting_booked: z.number().int().default(0),
    positive_replied: z.number().int().default(0),
  })
  .passthrough();

export const InstantlyWebhookEventSchema = z
  .object({
    event_type: z.enum([
      "reply_received",
      "auto_reply_received",
      "email_bounced",
      "email_opened",
      "email_link_clicked",
      "lead_unsubscribed",
      "lead_interested",
      "lead_meeting_booked",
      "campaign_completed",
      "email_sent",
    ]),
    timestamp: z.string(),
    campaign_id: z.string().optional(),
    lead_email: z.string().email().optional(),
    step: z.number().int().optional(),
    variant: z.number().int().optional(),
    email_id: z.string().optional(),
    reply_text: z.string().optional(),
    reply_html: z.string().optional(),
    ai_interest_score: z.number().optional(),
  })
  .passthrough();
export type InstantlyWebhookEvent = z.infer<typeof InstantlyWebhookEventSchema>;
