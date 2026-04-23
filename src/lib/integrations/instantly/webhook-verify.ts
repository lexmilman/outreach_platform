/**
 * Instantly.ai has no native HMAC signing. We verify via a shared bearer token
 * set in the INSTANTLY_WEBHOOK_SECRET env var and configured on every webhook
 * in the Instantly UI under `Authorization: Bearer <secret>`.
 */

export function verifyInstantlyWebhook(
  headers: Headers,
  expectedSecret: string,
): { ok: true } | { ok: false; reason: string } {
  if (!expectedSecret) return { ok: false, reason: "server misconfigured: no secret" };
  const auth = headers.get("authorization") ?? headers.get("Authorization");
  if (!auth) return { ok: false, reason: "missing authorization header" };
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!constantTimeEquals(token, expectedSecret)) return { ok: false, reason: "bad token" };
  return { ok: true };
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
