import { createClient } from "@/lib/supabase/server";
import {
  JobsBoard,
  type DlqRow,
  type JobRunRow,
  type QueueHealth,
} from "@/components/features/jobs/jobs-board";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function JobsPage() {
  const supabase = await createClient();

  const [runsRes, dlqRes, healthRes] = await Promise.all([
    supabase
      .from("job_runs")
      .select("id, job_id, type, status, attempt, cost_usd, started_at, ended_at, error")
      .order("started_at", { ascending: false })
      .limit(100),
    supabase.rpc("list_dlq", { p_limit: 100 }),
    supabase.rpc("queue_health"),
  ]);

  const initialRuns: JobRunRow[] = (runsRes.data ?? []) as unknown as JobRunRow[];
  const initialDlq: DlqRow[] = (dlqRes.data ?? []) as unknown as DlqRow[];
  const health: QueueHealth[] = (healthRes.data ?? []) as unknown as QueueHealth[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Jobs</h1>
        <p className="text-sm text-muted-foreground">
          Live view of the worker queue, recent runs, and the dead-letter queue. Subscribed to{" "}
          <code className="font-mono">job_runs</code> via Realtime.
        </p>
      </div>

      <JobsBoard initialRuns={initialRuns} initialDlq={initialDlq} health={health} />
    </div>
  );
}
