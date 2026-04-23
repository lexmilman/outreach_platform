import "server-only";
import { createClient } from "@/lib/supabase/server";
import { JobPayloadSchema, JobTypeSchema, type JobType, type JobPayload } from "./types";

export async function enqueueJob(input: {
  type: JobType;
  payload: JobPayload;
  orgId: string;
  delaySec?: number;
}): Promise<{ ok: true; msgId: number } | { ok: false; error: string }> {
  const type = JobTypeSchema.safeParse(input.type);
  const payload = JobPayloadSchema.safeParse(input.payload);
  if (!type.success || !payload.success) {
    return { ok: false, error: "invalid job shape" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enqueue_job", {
    p_type: type.data,
    p_payload: payload.data,
    p_org_id: input.orgId,
    p_delay: input.delaySec ?? 0,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, msgId: Number(data) };
}
