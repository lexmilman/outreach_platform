"use client";

import type { FieldMapping } from "@/lib/csv/auto-map";
import { mapRows } from "@/lib/csv/map-rows";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const VISIBLE_FIELDS = [
  "first_name",
  "last_name",
  "linkedin_url",
  "current_title",
  "current_company_name",
  "email",
  "location",
] as const;

export function PreviewTable({
  rows,
  mappings,
}: {
  rows: Record<string, string>[];
  mappings: FieldMapping[];
}) {
  const { mapped } = mapRows(
    rows,
    mappings.map((m) => ({ csvHeader: m.csvHeader, canonical: m.canonical })),
  );

  if (mapped.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        No valid rows after mapping. Adjust your column mappings above.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {VISIBLE_FIELDS.map((f) => (
              <TableHead key={f}>{f}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {mapped.slice(0, 5).map((m) => (
            <TableRow key={m.index}>
              {VISIBLE_FIELDS.map((f) => (
                <TableCell key={f} className="max-w-[180px] truncate text-sm">
                  {typeof m.lead[f] === "number" ? String(m.lead[f]) : (m.lead[f] as string) ?? "—"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
