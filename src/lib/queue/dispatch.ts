import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { JobMessageSchema, type JobType, type PayloadOf } from "./types";

export type EnqueueResult =
  | { ok: true; msgId: number }
  | { ok: false; error: string; issues?: unknown };

/**
 * Validate a job's payload against its per-type schema and enqueue it via the
 * `enqueue_job` SECURITY DEFINER RPC. Org-scoping is enforced inside the RPC.
 */
export async function enqueueJob<T extends JobType>(input: {
  type: T;
  payload: PayloadOf<T>;
  orgId: string;
  delaySec?: number;
}): Promise<EnqueueResult> {
  const parsed = JobMessageSchema.safeParse({ type: input.type, payload: input.payload });
  if (!parsed.success) {
    return { ok: false, error: `invalid job shape: ${input.type}`, issues: parsed.error.issues };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enqueue_job", {
    p_type: parsed.data.type,
    p_payload: parsed.data.payload as unknown as Json,
    p_org_id: input.orgId,
    p_delay: input.delaySec ?? 0,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, msgId: Number(data) };
}
