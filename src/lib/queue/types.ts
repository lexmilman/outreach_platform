import { z } from "zod";

// ---------- Per-type payload schemas ----------
// Every job type owns a payload schema. The dispatch wrapper validates the
// caller's payload against the matching schema before enqueueing, so we never
// push malformed messages onto pgmq (the worker has no way to apologise).

const Uuid = z.string().uuid();

export const CsvImportPayload = z.object({
  uploadId: Uuid,
  clientId: Uuid,
});

export const EnrichPersonApifyPayload = z.object({
  personId: Uuid,
});

export const EnrichCompanyApifyPayload = z.object({
  companyId: Uuid,
});

export const ScrapePostsApifyPayload = z.object({
  personId: Uuid,
  limit: z.number().int().min(1).max(100).default(20),
});

export const FindEmailFindymailPayload = z.object({
  personId: Uuid,
});

export const FindEmailSignalhirePayload = z.object({
  personId: Uuid,
});

export const VerifyEmailInstantlyPayload = z.object({
  emailId: Uuid,
});

export const ScoreLeadLlmPayload = z.object({
  personInCampaignId: Uuid,
});

export const GenerateMessagesLlmPayload = z.object({
  personInCampaignId: Uuid,
});

export const EnrichCustomPerplexityPayload = z.object({
  personId: Uuid,
  query: z.string().min(3).max(2000),
});

export const PushToInstantlyPayload = z.object({
  campaignId: Uuid,
  personInCampaignIds: z.array(Uuid).min(1).max(1000),
});

export const SyncInstantlyStatsPayload = z.object({
  campaignId: Uuid.optional(),
});

export const WaterfallEscalatePayload = z.object({
  personInCampaignId: Uuid,
  fromTier: z.number().int().min(1).max(5),
});

// ---------- Discriminated union over the message body ----------

export const JobMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("csv_import"), payload: CsvImportPayload }),
  z.object({ type: z.literal("enrich_person_apify"), payload: EnrichPersonApifyPayload }),
  z.object({ type: z.literal("enrich_company_apify"), payload: EnrichCompanyApifyPayload }),
  z.object({ type: z.literal("scrape_posts_apify"), payload: ScrapePostsApifyPayload }),
  z.object({ type: z.literal("find_email_findymail"), payload: FindEmailFindymailPayload }),
  z.object({ type: z.literal("find_email_signalhire"), payload: FindEmailSignalhirePayload }),
  z.object({ type: z.literal("verify_email_instantly"), payload: VerifyEmailInstantlyPayload }),
  z.object({ type: z.literal("score_lead_llm"), payload: ScoreLeadLlmPayload }),
  z.object({ type: z.literal("generate_messages_llm"), payload: GenerateMessagesLlmPayload }),
  z.object({ type: z.literal("enrich_custom_perplexity"), payload: EnrichCustomPerplexityPayload }),
  z.object({ type: z.literal("push_to_instantly"), payload: PushToInstantlyPayload }),
  z.object({ type: z.literal("sync_instantly_stats"), payload: SyncInstantlyStatsPayload }),
  z.object({ type: z.literal("waterfall_escalate"), payload: WaterfallEscalatePayload }),
]);

export type JobMessage = z.infer<typeof JobMessageSchema>;
export type JobType = JobMessage["type"];
export type PayloadOf<T extends JobType> = Extract<JobMessage, { type: T }>["payload"];

// Helper to enumerate the supported types (used by tests + UI filter chips).
export const JOB_TYPES = JobMessageSchema.options.map((o) => o.shape.type.value) as JobType[];

// ---------- Worker envelope (what's actually inside a pgmq message) ----------
// The DB enqueue_job RPC wraps the user payload with org_id + job_id.
export const JobEnvelopeSchema = z
  .object({
    org_id: z.string().uuid(),
    job_id: z.string(),
  })
  .and(JobMessageSchema);

export type JobEnvelope = z.infer<typeof JobEnvelopeSchema>;
