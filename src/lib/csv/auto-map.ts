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
 * Normalize a header for fuzzy comparison: lowercase, collapse separators.
 * `profile_url` → `profile url`. Used only for the Fuse fallback.
 */
function normalizeKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[_\-./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Exact column-name overrides for LinkedHelper v2 exports. The key is the raw
 * header lowercased (but NOT normalized — underscores preserved). A match here
 * bypasses Fuse entirely, avoiding false positives like `id` → linkedin_hash_id.
 */
const EXPLICIT_MAP: Record<string, CanonicalField> = {
  // identity
  first_name: "first_name",
  firstname: "first_name",
  "first name": "first_name",
  last_name: "last_name",
  lastname: "last_name",
  "last name": "last_name",
  surname: "last_name",
  full_name: "full_name",
  fullname: "full_name",
  "full name": "full_name",
  name: "full_name",

  profile_url: "linkedin_url",
  "profile url": "linkedin_url",
  linkedin_url: "linkedin_url",
  "linkedin url": "linkedin_url",
  linkedin: "linkedin_url",

  sn_hash_id: "linkedin_hash_id",
  linkedin_hash_id: "linkedin_hash_id",
  // Note: `hash_id` is INTENTIONALLY omitted here. In LinkedHelper v2 exports
  // it's almost always empty while `sn_hash_id` carries the real value. If the
  // operator's export has `hash_id` populated they can map it by hand.

  public_id: "public_identifier",
  public_identifier: "public_identifier",

  // profile
  headline: "headline",
  summary: "about",
  about: "about",

  location_name: "location",
  location: "location",
  city: "location",
  country: "country",

  avatar: "photo_url",
  photo: "photo_url",
  photo_url: "photo_url",

  connections_count: "connections_count",
  connections: "connections_count",
  followers: "followers_count",
  followers_count: "followers_count",

  email: "email",
  "email 1": "email",
  email_1: "email",

  phone_1: "phone",
  phone: "phone",

  // company (current)
  current_company: "current_company_name",
  "current company": "current_company_name",
  current_company_name: "current_company_name",
  company: "current_company_name",
  company_name: "current_company_name",

  current_company_position: "current_title",
  "current company position": "current_title",
  current_title: "current_title",
  "current title": "current_title",
  title: "current_title",
  position: "current_title",

  industry: "current_company_industry",
  current_company_industry: "current_company_industry",
  company_industry: "current_company_industry",
};

/**
 * Headers that must NEVER be auto-mapped. LinkedHelper v2 dumps loads of
 * internal bookkeeping columns that Fuse can accidentally match with high
 * scores (e.g. `id` → linkedin_hash_id via "member id"/"profile id" aliases).
 *
 * Exact set below + regex patterns further down.
 */
const DENY_EXACT = new Set<string>([
  "id",
  "id_type",
  "member_id",
  "hash_id",
  "lh_id",
  "avatar_id",
  "public_id_2",
  "public_id_actual_at",
  "member_id_actual_at",
  "r_member_id",
  "t_hash_id",
  "sn_member_id",
  "mini_profile_actual_at",
  "industry_actual_at",
  "current_company_actual_at",
  "original_full_name",
  "original_first_name",
  "original_last_name",
  "original_headline",
  "original_current_company",
  "original_current_company_position",
  "custom_first_name",
  "custom_last_name",
  "current_company_custom",
  "current_company_custom_position",
  "address",
  "birthday",
  "email_type",
  "note",
  "tags",
  "twitters",
  "skills",
  "languages",
  "member_distance",
  "network_info_following",
  "is_last_message_incoming",
  "has_unread_messages",
  "connected_at",
  "connected_at_iso",
  "invited_date",
  "invited_date_iso",
  "result_created_at",
  "result_created_at_iso",
  "add_to_target_date",
  "add_to_target_date_iso",
  "mutual_count",
  "mutual_first_fullname",
  "mutual_second_fullname",
  "original_mutual_first_fullname",
  "original_mutual_second_fullname",
  "custom_mutual_first_fullname",
  "custom_mutual_second_fullname",
]);

const DENY_PATTERNS: RegExp[] = [
  /^badges_/, // badges_premium / _influencer / etc
  /^third_party_email_/,
  /^phone_type_/,
  /^messenger_/,
  /^language_/,
  /^education_/,
  /^message_\d+/,
  /^replied_message_/,
  /^last_sent_message_/,
  /^last_received_message_/,
  // Prior organizations (organization_{2..6} and their sub-fields).
  /^organization_(id|url|title|start|end|description|location|website|domain)_[2-9]$/,
  /^position_description_\d+$/,
  /^position_is_default_\d+$/,
  // Prior org 1 we also skip — LH v2's "organization_*_1" is a DIFFERENT past
  // role than current_company, not the current company's metadata.
  /^organization_(id|url|title|start|end|description|location|website|domain)_1$/,
  /^organization_\d+$/,
  // Md5-looking hash-name columns LinkedHelper sometimes adds.
  /^[0-9a-f]{24,}$/i,
];

function isDenied(lower: string): boolean {
  if (DENY_EXACT.has(lower)) return true;
  return DENY_PATTERNS.some((re) => re.test(lower));
}

const ALIAS_CORPUS: AliasEntry[] = ALL_CANONICAL_FIELDS.flatMap((canonical) =>
  CANONICAL_ALIASES[canonical].map((alias) => ({ canonical, alias: normalizeKey(alias) })),
);

const fuse = new Fuse(ALIAS_CORPUS, {
  keys: ["alias"],
  threshold: 0.3,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 3,
});

const FUSE_CONFIDENCE_FLOOR = 0.55;

type Candidate = {
  headerIndex: number;
  canonical: CanonicalField;
  confidence: number;
};

export function autoMapColumns(headers: string[]): MappingResult {
  const out: FieldMapping[] = headers.map((h) => ({ csvHeader: h, canonical: null, confidence: 0 }));
  const candidates: Candidate[] = [];

  headers.forEach((h, idx) => {
    const lower = h.trim().toLowerCase();

    // 1) Explicit LinkedHelper v2 mapping wins outright.
    const exact = EXPLICIT_MAP[lower];
    if (exact) {
      candidates.push({ headerIndex: idx, canonical: exact, confidence: 1 });
      return;
    }

    // 2) Known-junk columns are ignored up front.
    if (isDenied(lower)) {
      return; // stays as {canonical: null, confidence: 0}
    }

    // 3) Otherwise fall back to Fuse, but only the TOP candidate per header
    //    and only if it clears the confidence floor.
    const needle = normalizeKey(h);
    if (needle.length < 3) return;
    const results = fuse.search(needle);
    const first = results[0];
    if (!first || first.score === undefined) return;
    const confidence = 1 - first.score;
    if (confidence < FUSE_CONFIDENCE_FLOOR) return;
    candidates.push({ headerIndex: idx, canonical: first.item.canonical, confidence });
  });

  // Best-score greedy assignment: sort by confidence desc, assign each canonical
  // to the highest-scoring header that wants it. Avoids first-come-first-served
  // problems (e.g. `avatar_id` stealing photo_url before we see `avatar`).
  candidates.sort((a, b) => b.confidence - a.confidence);
  const usedCanonical = new Set<CanonicalField>();
  const usedHeader = new Set<number>();
  for (const c of candidates) {
    if (usedCanonical.has(c.canonical)) continue;
    if (usedHeader.has(c.headerIndex)) continue;
    usedCanonical.add(c.canonical);
    usedHeader.add(c.headerIndex);
    out[c.headerIndex] = {
      csvHeader: headers[c.headerIndex]!,
      canonical: c.canonical,
      confidence: c.confidence,
    };
  }

  const matched = out.filter((m) => m.canonical);
  const overall = matched.length
    ? matched.reduce((sum, m) => sum + m.confidence, 0) / matched.length
    : 0;
  return { mappings: out, overallConfidence: overall };
}
