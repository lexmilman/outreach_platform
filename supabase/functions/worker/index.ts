// @ts-nocheck
// Supabase Edge Function: worker
// Invoked every 10s via pg_cron -> pg_net. Reads jobs from pgmq and dispatches.
//
// Sprint 3: implement per-type handlers. This scaffold:
//   - reads up to 5 messages (vt=420s)
//   - inserts a job_runs row
//   - deletes on success / sets vt on retry / DLQs after 5 attempts
//
// Keep heavy work inside EdgeRuntime.waitUntil so we can ACK the cron invocation fast.

import { createAdminClient } from "../_shared/supabase-admin.ts";

type JobMessage = {
  type: string;
  payload: Record<string, unknown>;
  org_id: string;
  job_id: string;
};

const BATCH_SIZE = 5;
const VT_SECONDS = 420;
const MAX_ATTEMPTS = 5;

Deno.serve(async (_req) => {
  const supabase = createAdminClient();

  // @ts-expect-error — Edge Runtime global
  EdgeRuntime.waitUntil(processBatch(supabase));

  return new Response(JSON.stringify({ ok: true }), {
    status: 202,
    headers: { "content-type": "application/json" },
  });
});

async function processBatch(supabase: ReturnType<typeof createAdminClient>) {
  const { data: msgs, error } = await supabase.rpc("pgmq_read", {
    queue_name: "jobs",
    vt: VT_SECONDS,
    qty: BATCH_SIZE,
  });
  if (error) {
    console.error("pgmq.read failed", error);
    return;
  }
  if (!msgs || msgs.length === 0) return;

  for (const m of msgs as { msg_id: number; read_ct: number; message: JobMessage }[]) {
    const { msg_id, read_ct, message } = m;
    await handleOne(supabase, msg_id, read_ct, message);
  }
}

async function handleOne(
  supabase: ReturnType<typeof createAdminClient>,
  msgId: number,
  readCt: number,
  message: JobMessage,
) {
  const jobRun = await supabase
    .from("job_runs")
    .insert({
      org_id: message.org_id,
      job_id: message.job_id,
      type: message.type,
      attempt: readCt,
      status: "running",
      payload: message.payload,
    })
    .select("id")
    .single();

  const start = Date.now();
  try {
    const output = await dispatch(supabase, message);
    await supabase
      .from("job_runs")
      .update({
        status: "succeeded",
        output,
        ended_at: new Date().toISOString(),
        cost_usd: (output as { costUsd?: number })?.costUsd ?? 0,
      })
      .eq("id", jobRun.data?.id);

    await supabase.rpc("pgmq_delete", { queue_name: "jobs", msg_id: msgId });
  } catch (err) {
    console.error(`Job ${message.type} failed`, err);
    const errMessage = err instanceof Error ? err.message : String(err);

    if (readCt >= MAX_ATTEMPTS) {
      await supabase.rpc("pgmq_send", {
        queue_name: "dlq",
        msg: { ...message, failed_at: new Date().toISOString(), last_error: errMessage },
      });
      await supabase.rpc("pgmq_archive", { queue_name: "jobs", msg_id: msgId });
      await supabase
        .from("job_runs")
        .update({ status: "failed", error: errMessage, ended_at: new Date().toISOString() })
        .eq("id", jobRun.data?.id);
    } else {
      const backoffSec = Math.min(3600, Math.pow(2, readCt) * 30 + Math.floor(Math.random() * 15));
      await supabase.rpc("extend_vt", { p_queue: "jobs", p_msg_id: msgId, p_offset: backoffSec });
      await supabase
        .from("job_runs")
        .update({
          status: "retrying",
          error: errMessage,
          ended_at: new Date().toISOString(),
        })
        .eq("id", jobRun.data?.id);
    }
  } finally {
    console.log(`job ${message.type} ${message.job_id} took ${Date.now() - start}ms`);
  }
}

// ------- Dispatch table (Sprint 3: implement each case) -------

async function dispatch(
  supabase: ReturnType<typeof createAdminClient>,
  message: JobMessage,
): Promise<unknown> {
  switch (message.type) {
    case "csv_import":
    case "enrich_person_apify":
    case "enrich_company_apify":
    case "scrape_posts_apify":
    case "find_email_findymail":
    case "find_email_signalhire":
    case "verify_email_instantly":
    case "score_lead_llm":
    case "generate_messages_llm":
    case "enrich_custom_perplexity":
    case "push_to_instantly":
    case "sync_instantly_stats":
    case "waterfall_escalate":
      // TODO(Sprint 3): implement handler.
      return { noop: true, type: message.type };
    default:
      throw new Error(`unknown job type: ${message.type}`);
  }
}
