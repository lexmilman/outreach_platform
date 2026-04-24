"use client";

import { useMemo, useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { formatRelative, formatUsd } from "@/lib/utils";
import { replayDlqAction } from "@/app/(dashboard)/jobs/actions";
import { toast } from "sonner";
import { StatusBadge } from "./status-badge";

export type JobRunRow = {
  id: string;
  job_id: string;
  type: string;
  status: string;
  attempt: number;
  cost_usd: number | string | null;
  started_at: string;
  ended_at: string | null;
  error: string | null;
};

export type DlqRow = {
  msg_id: number;
  enqueued_at: string;
  read_ct: number;
  message: { type?: string; org_id?: string; payload?: unknown } | null;
};

export type QueueHealth = {
  queue_name: string;
  queue_length: number;
  oldest_msg_age_sec: number;
};

type Props = {
  initialRuns: JobRunRow[];
  initialDlq: DlqRow[];
  health: QueueHealth[];
};

const RUN_LIMIT = 100;

export function JobsBoard({ initialRuns, initialDlq, health }: Props) {
  const [runs, setRuns] = useState<JobRunRow[]>(initialRuns);
  const [dlq, setDlq] = useState<DlqRow[]>(initialDlq);
  const [pending, startTransition] = useTransition();

  useRealtimeTable<JobRunRow>({
    table: "job_runs",
    onUpsert: (row) => {
      setRuns((prev) => {
        const next = prev.filter((r) => r.id !== row.id);
        next.unshift(row);
        return next.slice(0, RUN_LIMIT);
      });
    },
    onDelete: (id) => setRuns((prev) => prev.filter((r) => r.id !== id)),
  });

  const stats = useMemo(() => {
    const acc = { running: 0, retrying: 0, failed: 0, succeeded: 0 };
    for (const r of runs) {
      if (r.status in acc) acc[r.status as keyof typeof acc] += 1;
    }
    return acc;
  }, [runs]);

  const handleReplay = (msgId: number) => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("msgId", String(msgId));
      const res = await replayDlqAction(fd);
      if (res.ok) {
        setDlq((prev) => prev.filter((m) => m.msg_id !== msgId));
        toast.success(`Replayed → new msg ${res.newMsgId}`);
      } else {
        toast.error(`Replay failed: ${res.error}`);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {health.map((q) => (
          <Card key={q.queue_name}>
            <CardHeader className="pb-1">
              <CardTitle className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                {q.queue_name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-display text-2xl font-semibold">{q.queue_length}</div>
              <p className="text-xs text-muted-foreground">
                oldest {Math.max(0, q.oldest_msg_age_sec ?? 0)}s
              </p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              recent runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2 text-sm">
              <span className="text-emerald-500">{stats.succeeded}✓</span>
              <span className="text-brand-500">{stats.running}▶</span>
              <span className="text-amber-500">{stats.retrying}↻</span>
              <span className="text-red-500">{stats.failed}✗</span>
            </div>
            <p className="text-xs text-muted-foreground">last {runs.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Dead-letter queue</CardTitle>
          <span className="text-xs text-muted-foreground">{dlq.length} stuck</span>
        </CardHeader>
        <CardContent className="p-0">
          {dlq.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              Empty — no jobs have exhausted retries.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Msg</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Enqueued</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dlq.map((m) => (
                  <TableRow key={m.msg_id}>
                    <TableCell className="font-mono text-xs">{m.msg_id}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {m.message?.type ?? "—"}
                    </TableCell>
                    <TableCell>{m.read_ct}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelative(m.enqueued_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => handleReplay(m.msg_id)}
                      >
                        <RotateCcw className="size-3.5" /> Replay
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Recent runs</CardTitle>
          <span className="text-xs text-muted-foreground">live · {runs.length}/{RUN_LIMIT}</span>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No job_runs yet. Enqueue something to see it here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempt</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="w-[40%]">Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.type}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.attempt}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatUsd(Number(r.cost_usd ?? 0))}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelative(r.started_at)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{durationOf(r)}</TableCell>
                    <TableCell className="truncate text-xs text-red-500" title={r.error ?? ""}>
                      {r.error ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function durationOf(r: JobRunRow): string {
  if (!r.ended_at) return "…";
  const ms = new Date(r.ended_at).getTime() - new Date(r.started_at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
