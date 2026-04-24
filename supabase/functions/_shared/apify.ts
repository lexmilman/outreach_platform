// @ts-nocheck
// Deno-side Apify helpers. Mirrors src/lib/integrations/apify/client.ts but
// without server-only imports / Node Buffer / zod (kept tiny on purpose).
//
// Lives in supabase/functions/_shared/ so both the worker and webhooks-apify
// edge functions can pull from one source of truth.

const BASE = "https://api.apify.com/v2";

// Pinned actor catalog — must stay in lockstep with src/lib/integrations/apify/actors.ts.
// Single source of truth would require build-time codegen; for now we keep a
// short copy and rely on tests + reviews to catch drift.
export const APIFY_ACTORS = {
  personProfile: { id: "dev_fusion~linkedin-profile-scraper", build: "latest" },
  companyProfile: { id: "dev_fusion~linkedin-company-scraper", build: "latest" },
  profilePosts: { id: "harvestapi~linkedin-profile-posts", build: "latest" },
} as const;

export type ApifyActorKey = keyof typeof APIFY_ACTORS;

export async function startActorRun(input: {
  actor: ApifyActorKey;
  body: Record<string, unknown>;
  webhookUrl: string;
  webhookSecret: string;
}): Promise<{ ok: true; runId: string; datasetId: string } | { ok: false; error: string }> {
  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) return { ok: false, error: "APIFY_TOKEN not set" };

  const actor = APIFY_ACTORS[input.actor];
  const qs = new URLSearchParams({ token, build: actor.build });

  const callbackUrl = appendQs(input.webhookUrl, { secret: input.webhookSecret });
  const webhooks = [
    {
      eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED"],
      requestUrl: callbackUrl,
    },
  ];
  qs.set("webhooks", btoa(JSON.stringify(webhooks)));

  const res = await fetch(`${BASE}/acts/${encodeURIComponent(actor.id)}/runs?${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `apify start ${res.status}: ${text.slice(0, 200)}` };
  }

  const json = (await res.json()) as { data?: { id?: string; defaultDatasetId?: string } };
  if (!json.data?.id || !json.data?.defaultDatasetId) {
    return { ok: false, error: "apify response missing id/datasetId" };
  }
  return { ok: true, runId: json.data.id, datasetId: json.data.defaultDatasetId };
}

export async function getDatasetItems(
  datasetId: string,
  opts: { limit?: number } = {},
): Promise<unknown[]> {
  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) throw new Error("APIFY_TOKEN not set");

  const qs = new URLSearchParams({
    token,
    clean: "true",
    format: "json",
    limit: String(opts.limit ?? 1000),
  });
  const res = await fetch(`${BASE}/datasets/${encodeURIComponent(datasetId)}/items?${qs}`);
  if (!res.ok) throw new Error(`apify dataset fetch ${res.status}`);
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error("apify dataset response not an array");
  return items;
}

export function findActorKeyById(actId: string): ApifyActorKey | null {
  for (const [key, val] of Object.entries(APIFY_ACTORS)) {
    if (val.id === actId) return key as ApifyActorKey;
  }
  return null;
}

function appendQs(url: string, params: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}
