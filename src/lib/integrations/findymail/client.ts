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

// FindyMail bills 1 credit per successful email lookup. Plan rate is per-org
// configurable in api_integrations_config.config.usd_per_credit; the default
// here matches the public Pay-As-You-Go price ($15 / 1000 credits).
const DEFAULT_USD_PER_CREDIT = 0.015;

function isMock(env = serverEnv()): boolean {
  return env.MOCK_FINDYMAIL === "1" || !env.FINDYMAIL_API_KEY;
}

async function loadMock<T>(name: string): Promise<T> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.resolve(process.cwd(), "test/fixtures/findymail", `${name}.json`);
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

export async function findEmailByLinkedin(
  linkedinUrl: string,
): Promise<IntegrationResult<FindyMailContact | null>> {
  const env = serverEnv();
  if (isMock(env)) {
    const mock = await loadMock<{ contact: FindyMailContact | null }>("search-linkedin");
    return {
      ok: true,
      data: mock.contact,
      costUsd: mock.contact ? DEFAULT_USD_PER_CREDIT : 0,
      provider: "findymail",
      latencyMs: 0,
      meta: { mock: true },
    };
  }

  const started = Date.now();
  const res = await fetchWithRetry(
    `${BASE}/api/search/linkedin`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.FINDYMAIL_API_KEY}`,
      },
      body: JSON.stringify({ linkedin_url: linkedinUrl }),
    },
    { provider: "findymail" },
  );
  const json = await res.json();
  const parsed = FindyMailSearchLinkedinResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: new ValidationError("FindyMail response shape changed", "findymail", parsed.error.issues),
    };
  }
  return {
    ok: true,
    data: parsed.data.contact,
    costUsd: parsed.data.contact ? DEFAULT_USD_PER_CREDIT : 0,
    provider: "findymail",
    latencyMs: Date.now() - started,
  };
}

export async function findEmailByName(input: {
  firstName: string;
  lastName: string;
  domain: string;
}): Promise<IntegrationResult<FindyMailContact | null>> {
  const env = serverEnv();
  if (isMock(env)) {
    const mock = await loadMock<{ contact: FindyMailContact | null }>("search-name");
    return {
      ok: true,
      data: mock.contact,
      costUsd: mock.contact ? DEFAULT_USD_PER_CREDIT : 0,
      provider: "findymail",
      latencyMs: 0,
      meta: { mock: true },
    };
  }

  const started = Date.now();
  const res = await fetchWithRetry(
    `${BASE}/api/search/name`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.FINDYMAIL_API_KEY}`,
      },
      body: JSON.stringify(input),
    },
    { provider: "findymail" },
  );
  const json = await res.json();
  const parsed = FindyMailSearchNameResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: new ValidationError("FindyMail name search shape changed", "findymail", parsed.error.issues),
    };
  }
  return {
    ok: true,
    data: parsed.data.contact,
    costUsd: parsed.data.contact ? DEFAULT_USD_PER_CREDIT : 0,
    provider: "findymail",
    latencyMs: Date.now() - started,
  };
}

export async function verifyEmail(
  email: string,
): Promise<IntegrationResult<{ verified: boolean }>> {
  const env = serverEnv();
  if (isMock(env)) {
    return {
      ok: true,
      data: { verified: true },
      costUsd: 0,
      provider: "findymail",
      latencyMs: 0,
      meta: { mock: true },
    };
  }

  const started = Date.now();
  const res = await fetchWithRetry(
    `${BASE}/api/verify`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.FINDYMAIL_API_KEY}`,
      },
      body: JSON.stringify({ email }),
    },
    { provider: "findymail" },
  );
  const json = await res.json();
  const parsed = FindyMailVerifyResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      error: new ValidationError("FindyMail verify shape changed", "findymail", parsed.error.issues),
    };
  }
  return {
    ok: true,
    data: { verified: parsed.data.verified },
    costUsd: 0,
    provider: "findymail",
    latencyMs: Date.now() - started,
  };
}

export { FindyMailSearchNameResponseSchema };
