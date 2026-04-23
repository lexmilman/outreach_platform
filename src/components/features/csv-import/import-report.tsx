"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";

export function ImportReportPanel({
  totalRows,
  validCount,
  rejectedPreview,
  audienceName,
  clientName,
}: {
  totalRows: number;
  validCount: number;
  rejectedPreview: { index: number; reason: string }[];
  audienceName: string;
  clientName?: string;
}) {
  const rejectedCount = totalRows - validCount;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Audience
        </p>
        <p className="mt-1 font-display text-lg font-semibold">{audienceName || "—"}</p>
        <p className="text-sm text-muted-foreground">{clientName ?? "No client"}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Total" value={totalRows} />
        <Metric label="Valid" value={validCount} tone="ok" />
        <Metric label="Rejected" value={rejectedCount} tone={rejectedCount > 0 ? "warn" : "ok"} />
      </div>
      {rejectedCount > 0 ? (
        <div className="md:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Rejected rows · showing first {Math.min(10, rejectedCount)}
          </p>
          <div className="mt-2 space-y-1 rounded-md border bg-amber-500/5 p-3">
            {rejectedPreview.map((r) => (
              <div key={r.index} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 size-3.5 text-amber-500" />
                <span className="font-mono text-xs text-muted-foreground">row {r.index + 2}</span>
                <span className="text-muted-foreground">{r.reason}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border bg-emerald-500/5 p-3 text-sm md:col-span-2">
          <CheckCircle2 className="size-4 text-emerald-500" />
          All rows passed validation.
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "ok" | "warn";
}) {
  const color =
    tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : "";
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`font-display text-2xl font-semibold ${color}`}>{value.toLocaleString()}</p>
    </div>
  );
}
