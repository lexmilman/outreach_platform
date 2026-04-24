import "server-only";
import { serverEnv } from "@/lib/env.server";
import { APIFY_ACTORS, type ApifyActorKey } from "./actors";
import {
  ApifyRunSchema,
  type ApifyRun,
  type ApifyPersonItem,
  type ApifyCompanyItem,
  type ApifyPostItem,
} from "./schemas";
import { fetchWithRetry, ValidationError, ApiError } from "../_shared/http";
import type { IntegrationResult } from "../_shared/result";

const BASE = "https://api.apify.com/v2";

// ---------- Mock mode ----------
// MOCK_APIFY=1 short-circuits HTTP and returns canned fixtures from
// test/fixtures/apify/. Used in `pnpm dev` when no real token is available.

async function loadMock<T>(name: string): Promise<T> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.resolve(process.cwd(), "test/fixtures/apify", `${name}.json`);
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as T;
}

function isMock(env = serverEnv()): boolean {
  return env.MOCK_APIFY === "1" || !env.APIFY_TOKEN;
}

// ---------- Start actor run ----------

export async function startActorRun(input: {
  actor: ApifyActorKey;
  body: Record<string, unknown>;
  webhookUrl?: string;
  webhookSecret?: string;
}): Promise<IntegrationResult<{ runId: string; datasetId: string; actorId: string }>> {
  const env = serverEnv();
  const actor = APIFY_ACTORS[input.actor];

  if (isMock(env)) {
    const run = await loadMock<{ data: ApifyRun }>("run-started");
    return {
      ok: true,
      data: { runId: run.data.id, datasetId: run.data.defaultDatasetId, actorId: actor.id },
      costUsd: 0,
      provider: "apify",
      latencyMs: 0,
      meta: { mock: true },
    };
  }

  if (!env.APIFY_TOKEN) {
    return {
      ok: false,
      error: new ValidationError("APIFY_TOKEN is not set", "apify", null),
    };
  }

  const qs = new URLSearchParams({ token: env.APIFY_TOKEN, build: actor.build });
  if (input.webhookUrl) {
    const webhookUrl = appendSecret(input.webhookUrl, input.webhookSecret);
    const webhooks = [
      {
        eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED"],
        requestUrl: webhookUrl,
      },
    ];
    qs.set("webhooks", base64(JSON.stringify(webhooks)));
  }

  const started = Date.now();
  const res = await fetchWithRetry(
    `${BASE}/acts/${encodeURIComponent(actor.id)}/runs?${qs.toString()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.body),
    },
    { provider: "apify" },
  );

  const json = (await res.json()) as { data: unknown };
  const parsed = ApifyRunSchema.safeParse(json.data);
  if (!parsed.success) {
    return {
      ok: false,
      error: new ValidationError("Apify run response shape changed", "apify", parsed.error.issues),
    };
  }

  return {
    ok: true,
    data: { runId: parsed.data.id, datasetId: parsed.data.defaultDatasetId, actorId: actor.id },
    costUsd: 0, // billed when the run finishes; finalized via getRun() or webhook payload
    provider: "apify",
    latencyMs: Date.now() - started,
  };
}

// ---------- Poll a run (used outside webhook flows, e.g. Vitest) ----------

export async function getRun(runId: string): Promise<IntegrationResult<ApifyRun>> {
  const env = serverEnv();
  if (isMock(env)) {
    const m = await loadMock<{ data: ApifyRun }>("run-succeeded");
    return {
      ok: true,
      data: m.data,
      costUsd: m.data.usageTotalUsd ?? 0,
      provider: "apify",
      latencyMs: 0,
      meta: { mock: true },
    };
  }
  if (!env.APIFY_TOKEN) {
    return {
      ok: false,
      error: new ValidationError("APIFY_TOKEN is not set", "apify", null),
    };
  }

  const started = Date.now();
  const res = await fetchWithRetry(
    `${BASE}/actor-runs/${encodeURIComponent(runId)}?token=${env.APIFY_TOKEN}`,
    { method: "GET" },
    { provider: "apify" },
  );
  const json = (await res.json()) as { data: unknown };
  const parsed = ApifyRunSchema.safeParse(json.data);
  if (!parsed.success) {
    return {
      ok: false,
      error: new ValidationError("Apify run response shape changed", "apify", parsed.error.issues),
    };
  }
  return {
    ok: true,
    data: parsed.data,
    costUsd: parsed.data.usageTotalUsd ?? 0,
    provider: "apify",
    latencyMs: Date.now() - started,
  };
}

// ---------- Read dataset items ----------

export async function getDatasetItems<T = unknown>(
  datasetId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<IntegrationResult<T[]>> {
  const env = serverEnv();
  if (isMock(env)) {
    const fixture = (await loadMock<T[]>("dataset-items")) as T[];
    return {
      ok: true,
      data: fixture,
      costUsd: 0,
      provider: "apify",
      latencyMs: 0,
      meta: { mock: true },
    };
  }
  if (!env.APIFY_TOKEN) {
    return {
      ok: false,
      error: new ValidationError("APIFY_TOKEN is not set", "apify", null),
    };
  }

  const qs = new URLSearchParams({
    token: env.APIFY_TOKEN,
    clean: "true",
    format: "json",
    limit: String(opts.limit ?? 1000),
    offset: String(opts.offset ?? 0),
  });

  const started = Date.now();
  const res = await fetchWithRetry(
    `${BASE}/datasets/${encodeURIComponent(datasetId)}/items?${qs.toString()}`,
    { method: "GET" },
    { provider: "apify" },
  );
  const items = (await res.json()) as unknown;
  if (!Array.isArray(items)) {
    return {
      ok: false,
      error: new ApiError("Apify dataset response is not an array", 502, items, "apify"),
    };
  }
  return {
    ok: true,
    data: items as T[],
    costUsd: 0,
    provider: "apify",
    latencyMs: Date.now() - started,
  };
}

// ---------- Helpers ----------

function appendSecret(url: string, secret?: string): string {
  if (!secret) return url;
  const u = new URL(url);
  u.searchParams.set("secret", secret);
  return u.toString();
}

function base64(s: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(s).toString("base64");
  // Edge runtime fallback
  return btoa(s);
}

// Re-export item types for callers.
export type { ApifyPersonItem, ApifyCompanyItem, ApifyPostItem, ApifyRun };
