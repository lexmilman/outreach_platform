// @ts-nocheck
// Tiny structured-log helper for the worker + handlers.
//
// Why this file exists: Supabase Dashboard's Logs tab shows access logs
// (one line per HTTP invocation with status code + duration), not stdout
// from inside the Deno handler. We mirror our most useful logs into
// public.worker_log via an RPC so the operator can `select * from
// worker_log order by id desc limit 50` and actually see what happened.

import type { createAdminClient } from "./supabase-admin.ts";

type Supabase = ReturnType<typeof createAdminClient>;
type Level = "info" | "warn" | "error";

export async function workerLog(
  supabase: Supabase,
  level: Level,
  message: string,
  jobId: string | null,
  type: string | null,
  context: Record<string, unknown> | null = null,
): Promise<void> {
  try {
    await supabase.rpc("worker_log_write", {
      p_level: level,
      p_message: message,
      p_job_id: jobId,
      p_type: type,
      p_context: context,
    });
  } catch (_e) {
    // Logging must never throw. Best effort: drop silently.
  }
}
