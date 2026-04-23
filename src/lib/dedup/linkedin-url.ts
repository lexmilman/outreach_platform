/**
 * LinkedIn URL normalization.
 *
 * Accepts:
 *   - public: https://www.linkedin.com/in/<slug>
 *   - sales nav: https://www.linkedin.com/sales/lead/<hash>,NAME_SEARCH,xxxx
 *
 * Returns { publicUrl, hashId } where:
 *   - publicUrl is the canonical lowercase-host, trailing-slash-stripped form,
 *     or null if we only have a sales-nav hash.
 *   - hashId is the Sales Nav ACwAA... fragment, or null for a public URL.
 */

export type NormalizedLinkedInUrl = {
  publicUrl: string | null;
  hashId: string | null;
  raw: string;
};

const PUBLIC_IN = /^https?:\/\/(?:www\.)?linkedin\.com\/in\/([^/?#]+)\/?/i;
const PUBLIC_COMPANY = /^https?:\/\/(?:www\.)?linkedin\.com\/company\/([^/?#]+)\/?/i;
const SALES_NAV = /^https?:\/\/(?:www\.)?linkedin\.com\/sales\/lead\/([^,]+)/i;

export function normalizeLinkedInUrl(raw: string | null | undefined): NormalizedLinkedInUrl {
  const empty: NormalizedLinkedInUrl = { publicUrl: null, hashId: null, raw: raw ?? "" };
  if (!raw) return empty;
  const trimmed = raw.trim();

  const m1 = trimmed.match(PUBLIC_IN);
  if (m1 && m1[1]) {
    return {
      publicUrl: `https://www.linkedin.com/in/${m1[1].toLowerCase()}`,
      hashId: null,
      raw: trimmed,
    };
  }

  const m2 = trimmed.match(SALES_NAV);
  if (m2 && m2[1]) {
    return { publicUrl: null, hashId: m2[1], raw: trimmed };
  }

  const m3 = trimmed.match(PUBLIC_COMPANY);
  if (m3 && m3[1]) {
    return {
      publicUrl: `https://www.linkedin.com/company/${m3[1].toLowerCase()}`,
      hashId: null,
      raw: trimmed,
    };
  }

  return empty;
}
