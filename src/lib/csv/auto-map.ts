import Fuse from "fuse.js";
import { ALL_CANONICAL_FIELDS, CANONICAL_ALIASES, type CanonicalField } from "./linked-helper";

export type FieldMapping = {
  csvHeader: string;
  canonical: CanonicalField | null;
  confidence: number; // 0..1
};

export type MappingResult = {
  mappings: FieldMapping[];
  overallConfidence: number;
};

type AliasEntry = { canonical: CanonicalField; alias: string };

/**
 * Normalize a header (from CSV) or an alias (from our corpus) before comparison.
 * LinkedHelper v2 exports use snake_case (e.g. `profile_url`, `location_name`) while
 * our alias corpus uses human-readable form (e.g. "profile url"). Collapse both.
 */
function normalizeKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[_\-./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIAS_CORPUS: AliasEntry[] = ALL_CANONICAL_FIELDS.flatMap((canonical) =>
  CANONICAL_ALIASES[canonical].map((alias) => ({ canonical, alias: normalizeKey(alias) })),
);

const fuse = new Fuse(ALIAS_CORPUS, {
  keys: ["alias"],
  threshold: 0.35,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
});

export function autoMapColumns(headers: string[]): MappingResult {
  const used = new Set<CanonicalField>();
  const mappings: FieldMapping[] = headers.map((h) => {
    const needle = normalizeKey(h);
    const results = fuse.search(needle);
    const first = results[0];
    if (!first || first.score === undefined) {
      return { csvHeader: h, canonical: null, confidence: 0 };
    }
    const confidence = 1 - first.score;
    if (used.has(first.item.canonical)) {
      return { csvHeader: h, canonical: null, confidence };
    }
    if (confidence < 0.4) {
      return { csvHeader: h, canonical: null, confidence };
    }
    used.add(first.item.canonical);
    return { csvHeader: h, canonical: first.item.canonical, confidence };
  });

  const matched = mappings.filter((m) => m.canonical);
  const overall = matched.length
    ? matched.reduce((sum, m) => sum + m.confidence, 0) / matched.length
    : 0;
  return { mappings, overallConfidence: overall };
}
