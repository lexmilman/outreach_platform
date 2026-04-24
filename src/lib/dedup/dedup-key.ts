/**
 * Deduplication key for the `people` table.
 *
 * Priority order:
 *   1. `hashId` — LinkedIn Sales Nav ACw... hash. Globally unique per LinkedIn
 *      member. Preferred when linkedin_url is not a public /in/ URL.
 *   2. `firstName + lastName + domain` — when hashId is absent but we know the
 *      current company domain. Distinguishes two people with the same name
 *      working at different companies.
 *   3. `null` — not enough signal; caller should reject or warn the operator.
 *      (We deliberately refuse to collapse two people solely on name.)
 *
 * Works on both server (node:crypto) and browser (crypto.subtle).
 */

function normalize(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join("|");
}

export function dedupInput(input: {
  firstName?: string | null;
  lastName?: string | null;
  domain?: string | null;
  hashId?: string | null;
}): string {
  if (input.hashId && input.hashId.trim().length > 0) {
    return `hash:${input.hashId.trim()}`;
  }
  const named = normalize([input.firstName, input.lastName, input.domain]);
  if (named) return `name:${named}`;
  return "";
}

async function sha256Hex(text: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle !== "undefined") {
    const buf = new TextEncoder().encode(text);
    const hash = await globalThis.crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(text).digest("hex");
}

export async function computeDedupKey(input: {
  firstName?: string | null;
  lastName?: string | null;
  domain?: string | null;
  hashId?: string | null;
}): Promise<string | null> {
  // Strongest signal: LinkedIn hash ID.
  if (input.hashId && input.hashId.trim().length > 0) {
    return sha256Hex(`hash:${input.hashId.trim()}`);
  }
  // Next: name + domain. Require both name parts OR name + domain.
  if (!input.firstName && !input.lastName) return null;
  const hasDomain = Boolean(input.domain && input.domain.trim().length > 0);
  if (!hasDomain) return null; // refuse to collapse on name alone
  const inputStr = normalize([input.firstName, input.lastName, input.domain]);
  if (!inputStr) return null;
  return sha256Hex(`name:${inputStr}`);
}
