// @ts-nocheck
// Supabase Edge Function: worker
// Invoked every 10s via pg_cron -> pg_net. Reads jobs from pgmq and dispatches.
//
// Visibility model (the operator can't see Deno stdout/stderr in the
// Supabase Dashboard):
//   - job_runs row is inserted FIRST, before any other work, so even if
//     dispatch crashes, the failure is queryable.
//   - worker_log table receives structured entry/exit lines for every job
//     including the first 5 stack frames on error.

import { createAdminClient } from "../_shared/supabase-admin.ts";
import {
  handleEnrichPersonApify,
  handleEnrichCompanyApify,
  handleScrapePostsApify,
} from "../_shared/handlers-apify.ts";
import {
  handleFindEmailFindymail,
  handleFindEmailSignalhire,
  handleVerifyEmailInstantly,
} from "../_shared/handlers-email.ts";
import {
  handleScoreLeadLlm,
  handleGenerateMessagesLlm,
} from "../_shared/handlers-llm.ts";
import { handleEnrichCustomPerplexity } from "../_shared/handlers-perplexity.ts";
import {
  handleInstantlyCreateCampaign,
  handlePushToInstantly,
  handleSyncInstantlyStats,
} from "../_shared/handlers-instantly.ts";
import { workerLog } from "../_shared/worker-log.ts";

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
  EdgeRuntime.waitUntil(
    processBatch(supabase).catch((err) => {
      // Last-resort log if processBatch itself throws (e.g., pgmq_read 401).
      workerLog(supabase, "error", "processBatch threw", null, null, {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? topFrames(err.stack, 5) : null,
      }).catch(() => {});
    }),
  );

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
    await workerLog(supabase, "error", "pgmq_read failed", null, null, {
      error: error.message ?? String(error),
    });
    return;
  }
  if (!msgs || msgs.length === 0) return;

  for (const m of msgs as { msg_id: number; read_ct: number; message: JobMessage }[]) {
    await handleOne(supabase, m.msg_id, m.read_ct, m.message);
  }
}

async function handleOne(
  supabase: ReturnType<typeof createAdminClient>,
  msgId: number,
  readCt: number,
  message: JobMessage,
) {
  // 1) Insert job_runs FIRST. If this fails the whole job aborts loudly via
  //    worker_log so the operator can see why.
  const jobRunIns = await supabase
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

  if (jobRunIns.error || !jobRunIns.data?.id) {
    await workerLog(supabase, "error", "job_runs insert failed", message.job_id, message.type, {
      msg_id: msgId,
      read_ct: readCt,
      error: jobRunIns.error?.message ?? "no id returned",
      payload: message.payload,
    });
    // Don't delete or re-queue: leave VT to expire so we get another shot.
    return;
  }
  const jobRunId = jobRunIns.data.id;

  await workerLog(supabase, "info", "dispatch start", message.job_id, message.type, {
    msg_id: msgId,
    read_ct: readCt,
    payload: message.payload,
  });

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
      .eq("id", jobRunId);

    await supabase.rpc("pgmq_delete", { queue_name: "jobs", msg_id: msgId });

    await workerLog(supabase, "info", "dispatch succeeded", message.job_id, message.type, {
      duration_ms: Date.now() - start,
      output_keys: output && typeof output === "object" ? Object.keys(output) : null,
    });
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? topFrames(err.stack, 5) : null;

    await workerLog(supabase, "error", "dispatch threw", message.job_id, message.type, {
      duration_ms: Date.now() - start,
      error: errMessage,
      stack,
      read_ct: readCt,
      will_dlq: readCt >= MAX_ATTEMPTS,
    });

    if (readCt >= MAX_ATTEMPTS) {
      await supabase.rpc("pgmq_send", {
        queue_name: "dlq",
        msg: { ...message, failed_at: new Date().toISOString(), last_error: errMessage },
      });
      await supabase.rpc("pgmq_archive", { queue_name: "jobs", msg_id: msgId });
      await supabase
        .from("job_runs")
        .update({
          status: "failed",
          error: errMessage,
          output: stack ? { stack } : null,
          ended_at: new Date().toISOString(),
        })
        .eq("id", jobRunId);
    } else {
      const backoffSec = Math.min(3600, Math.pow(2, readCt) * 30 + Math.floor(Math.random() * 15));
      await supabase.rpc("extend_vt", { p_queue: "jobs", p_msg_id: msgId, p_offset: backoffSec });
      await supabase
        .from("job_runs")
        .update({
          status: "retrying",
          error: errMessage,
          output: stack ? { stack } : null,
          ended_at: new Date().toISOString(),
        })
        .eq("id", jobRunId);
    }
  }
}

function topFrames(stack: string | undefined, n: number): string[] | null {
  if (!stack) return null;
  return stack.split("\n").slice(0, n + 1);
}

// ------- Dispatch table -------

async function dispatch(
  supabase: ReturnType<typeof createAdminClient>,
  message: JobMessage,
): Promise<unknown> {
  const { type, payload, org_id } = message;
  switch (type) {
    case "enrich_person_apify":
      return handleEnrichPersonApify(supabase, payload as { personId: string }, org_id);
    case "enrich_company_apify":
      return handleEnrichCompanyApify(supabase, payload as { companyId: string }, org_id);
    case "scrape_posts_apify":
      return handleScrapePostsApify(
        supabase,
        payload as { personId: string; limit?: number },
        org_id,
      );

    case "find_email_findymail":
      return handleFindEmailFindymail(supabase, payload as { personId: string }, org_id);
    case "find_email_signalhire":
      return handleFindEmailSignalhire(supabase, payload as { personId: string }, org_id);
    case "verify_email_instantly":
      return handleVerifyEmailInstantly(supabase, payload as { emailId: string }, org_id);

    case "score_lead_llm":
      return handleScoreLeadLlm(
        supabase,
        payload as { personInCampaignId: string },
        org_id,
      );
    case "generate_messages_llm":
      return handleGenerateMessagesLlm(
        supabase,
        payload as { personInCampaignId: string },
        org_id,
      );

    case "enrich_custom_perplexity":
      return handleEnrichCustomPerplexity(
        supabase,
        payload as { personId: string; query: string; model?: string },
        org_id,
      );
    case "instantly_create_campaign":
      return handleInstantlyCreateCampaign(
        supabase,
        payload as { campaignId: string },
        org_id,
      );
    case "push_to_instantly":
      return handlePushToInstantly(
        supabase,
        payload as { campaignId: string; personInCampaignIds: string[] },
        org_id,
      );
    case "sync_instantly_stats":
      return handleSyncInstantlyStats(
        supabase,
        payload as { campaignId?: string },
        org_id,
      );

    // Full multi-tier waterfall is Sprint 5+; today we noop to keep the queue drained.
    case "waterfall_escalate":
    // CSV import is handled synchronously today; reserved for future async path.
    case "csv_import":
      return { noop: true, type };
    default:
      throw new Error(`unknown job type: ${type}`);
  }
}
