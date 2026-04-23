import { z } from "zod";

export const JobTypeSchema = z.enum([
  "csv_import",
  "enrich_person_apify",
  "enrich_company_apify",
  "scrape_posts_apify",
  "find_email_findymail",
  "find_email_signalhire",
  "verify_email_instantly",
  "score_lead_llm",
  "generate_messages_llm",
  "enrich_custom_perplexity",
  "push_to_instantly",
  "sync_instantly_stats",
  "waterfall_escalate",
]);
export type JobType = z.infer<typeof JobTypeSchema>;

export const JobPayloadSchema = z.record(z.string(), z.unknown());
export type JobPayload = z.infer<typeof JobPayloadSchema>;

export const JobMessageSchema = z.object({
  type: JobTypeSchema,
  payload: JobPayloadSchema,
  org_id: z.string().uuid(),
  job_id: z.string(),
});
export type JobMessage = z.infer<typeof JobMessageSchema>;
