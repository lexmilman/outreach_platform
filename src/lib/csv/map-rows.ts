import { LeadSchema, type Lead } from "./schemas";
import type { CanonicalField } from "./linked-helper";

export type ColumnMapping = {
  csvHeader: string;
  canonical: CanonicalField | null;
};

export type MappedRow = {
  index: number;
  lead: Lead;
};

export type RejectedRow = {
  index: number;
  reason: string;
  raw: Record<string, string>;
};

export type MapResult = {
  mapped: MappedRow[];
  rejected: RejectedRow[];
};

/**
 * Apply the user-approved column mapping to each raw CSV row.
 * Rejected rows are surfaced with a human-readable reason — never dropped silently.
 */
export function mapRows(
  rows: Record<string, string>[],
  mappings: ColumnMapping[],
): MapResult {
  const byHeader = new Map(mappings.filter((m) => m.canonical).map((m) => [m.csvHeader, m.canonical!]));

  const mapped: MappedRow[] = [];
  const rejected: RejectedRow[] = [];

  rows.forEach((raw, index) => {
    const candidate: Record<string, string | undefined> = {};
    for (const [header, value] of Object.entries(raw)) {
      const canonical = byHeader.get(header);
      if (!canonical) continue;
      candidate[canonical] = value;
    }

    const parsed = LeadSchema.safeParse(candidate);
    if (!parsed.success) {
      rejected.push({
        index,
        reason: parsed.error.issues[0]?.message ?? "validation failed",
        raw,
      });
      return;
    }
    mapped.push({ index, lead: parsed.data });
  });

  return { mapped, rejected };
}
