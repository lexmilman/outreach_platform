"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FieldMapping } from "@/lib/csv/auto-map";
import type { CanonicalField } from "@/lib/csv/linked-helper";

const NONE = "__none__";

export function ColumnMapper({
  mappings,
  sampleRow,
  onChange,
  canonicalFields,
}: {
  mappings: FieldMapping[];
  sampleRow: Record<string, string>;
  onChange: (csvHeader: string, canonical: CanonicalField | null) => void;
  canonicalFields: readonly CanonicalField[];
}) {
  return (
    <div className="divide-y rounded-lg border bg-card">
      <div className="grid grid-cols-[1fr_auto_1.2fr_auto] items-center gap-3 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>CSV column</span>
        <span className="opacity-0">→</span>
        <span>Canonical field</span>
        <span>Confidence</span>
      </div>
      {mappings.map((m) => (
        <div key={m.csvHeader} className="grid grid-cols-[1fr_auto_1.2fr_auto] items-center gap-3 px-4 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{m.csvHeader}</p>
            <p className="truncate text-xs text-muted-foreground">
              {sampleRow[m.csvHeader] ?? "—"}
            </p>
          </div>
          <ArrowRight className="size-4 text-muted-foreground" />
          <Select
            value={m.canonical ?? NONE}
            onValueChange={(v) => onChange(m.csvHeader, v === NONE ? null : (v as CanonicalField))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Ignore" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Ignore this column —</SelectItem>
              {canonicalFields.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ConfidenceDot confidence={m.confidence} />
        </div>
      ))}
    </div>
  );
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const bucket =
    confidence >= 0.8 ? "high" : confidence >= 0.5 ? "mid" : confidence > 0 ? "low" : "none";
  const label = bucket === "none" ? "unmapped" : `${Math.round(confidence * 100)}%`;
  return (
    <div className="flex items-center justify-end gap-2">
      <span
        className={cn(
          "size-2 rounded-full",
          bucket === "high" && "bg-emerald-500",
          bucket === "mid" && "bg-amber-500",
          bucket === "low" && "bg-red-500",
          bucket === "none" && "bg-muted-foreground/40",
        )}
        aria-hidden
      />
      <span className="w-14 text-right text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
