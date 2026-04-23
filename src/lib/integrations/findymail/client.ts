import "server-only";
import { serverEnv } from "@/lib/env.server";
import { ValidationError, fetchWithRetry } from "../_shared/http";
import type { IntegrationResult } from "../_shared/result";
import {
  FindyMailSearchLinkedinResponseSchema,
  FindyMailSearchNameResponseSchema,
  FindyMailVerifyResponseSchema,
  type FindyMailContact,
} from "./schemas";

const BASE = "https://app.findymail.com";

// TODO(Sprint 3): finalize cost accounting vs plan rate.
const USD_PER_CREDIT = 0.015;

export async function findEmailByLinkedin(linkedinUrl: string): Promise<IntegrationResult<FindyMailContact | null>> {
  const env = serverEnv();
  if (!env.FINDYMAIL_API_KEY) {
    return { ok: false, error: new ValidationError("FINDYMAIL_API_KEY not set", "findymail", null) };
  }

  const started = Date.now();
  const res = await fetchWithRetry(`${BASE}/api/search/linkedin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.FINDYMAIL_API_KEY}`,
    },
    body: JSON.stringify({ linkedin_url: linkedinUrl }),
  }, { provider: "findymail" });

  const json = await res.json();
  const parsed = FindyMailSearchLinkedinResponseSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: new ValidationError("FindyMail response shape changed", "findymail", parsed.error.issues) };
  }

  const contact = parsed.data.contact;
  return {
    ok: true,
    data: contact,
    costUsd: contact ? USD_PER_CREDIT : 0,
    provider: "findymail",
    latencyMs: Date.now() - started,
  };
}

export async function verifyEmail(email: string): Promise<IntegrationResult<{ verified: boolean }>> {
  const env = serverEnv();
  if (!env.FINDYMAIL_API_KEY) {
    return { ok: false, error: new ValidationError("FINDYMAIL_API_KEY not set", "findymail", null) };
  }

  const started = Date.now();
  const res = await fetchWithRetry(`${BASE}/api/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.FINDYMAIL_API_KEY}`,
    },
    body: JSON.stringify({ email }),
  }, { provider: "findymail" });

  const json = await res.json();
  const parsed = FindyMailVerifyResponseSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: new ValidationError("FindyMail verify shape changed", "findymail", parsed.error.issues) };
  }

  return {
    ok: true,
    data: { verified: parsed.data.verified },
    costUsd: 0, // per-plan rate TBD
    provider: "findymail",
    latencyMs: Date.now() - started,
  };
}

// Export used schemas so tests can import & assert against fixtures.
export { FindyMailSearchNameResponseSchema };
