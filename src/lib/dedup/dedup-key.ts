/**
 * dedup_key = sha256(lower(first_name || last_name || domain)).
 * Used to dedup people without a LinkedIn URL. Works on the server (node:crypto)
 * and in the browser (crypto.subtle).
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
}): string {
  return normalize([input.firstName, input.lastName, input.domain]);
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
}): Promise<string | null> {
  const inputStr = dedupInput(input);
  if (!inputStr) return null;
  if (!input.firstName && !input.lastName) return null;
  return sha256Hex(inputStr);
}
