"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/current-org";
import { enqueueJob } from "@/lib/queue/dispatch";

export type EnrichBatchResult = {
  ok: boolean;
  enqueued: number;
  skipped: number;
  error?: string;
};

const InputSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100),
});

/**
 * Bulk-enqueue Apify person-profile enrichment for up to N people that:
 *   - have a linkedin_url
 *   - have not yet been enriched by Apify (data_json->'apify' is null)
 *
 * Uses the org-gated enqueue_job RPC, so it is RLS-safe.
 */
export async function runApifyPersonBatch(input: { limit: number }): Promise<EnrichBatchResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, enqueued: 0, skipped: 0, error: "invalid input" };

  const orgId = await requireOrgId();
  const supabase = await createClient();

  const { data: people, error } = await supabase
    .from("people")
    .select("id")
    .not("linkedin_url", "is", null)
    .filter("data_json->apify", "is", null)
    .order("created_at", { ascending: false })
    .limit(parsed.data.limit);

  if (error) return { ok: false, enqueued: 0, skipped: 0, error: error.message };
  if (!people || people.length === 0) return { ok: true, enqueued: 0, skipped: 0 };

  let enqueued = 0;
  let skipped = 0;
  for (const p of people) {
    const res = await enqueueJob({
      type: "enrich_person_apify",
      payload: { personId: p.id },
      orgId,
    });
    if (res.ok) enqueued++;
    else skipped++;
  }

  revalidatePath("/jobs");
  return { ok: true, enqueued, skipped };
}
