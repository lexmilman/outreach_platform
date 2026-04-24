// @ts-nocheck
// Worker handlers for the email-finder waterfall. Each handler:
//   1) loads the target person from Postgres
//   2) inserts a pending `enrichments` row
//   3) calls the provider API (FindyMail / SignalHire / Instantly verify)
//   4) on FindyMail/Instantly: synchronously finalize via RPC
//      on SignalHire: store request_id in signalhire_pending_requests and let
//      the webhook finalize when the callback arrives
//   5) chains to the next tier on miss

import type { createAdminClient } from "./supabase-admin.ts";

type Supabase = ReturnType<typeof createAdminClient>;

const FINDYMAIL_BASE = "https://app.findymail.com";
const SIGNALHIRE_BASE = "https://www.signalhire.com/api/v1";
const INSTANTLY_BASE = "https://api.instantly.ai";

// ---------- FindyMail (tier 1) ----------

export async function handleFindEmailFindymail(
  supabase: Supabase,
  payload: { personId: string },
  orgId: string,
) {
  const { data: person, error } = await supabase
    .from("people")
    .select("id, linkedin_url, first_name, last_name")
    .eq("id", payload.personId)
    .single();
  if (error || !person) throw new Error(`person ${payload.personId} not found`);
  if (!person.linkedin_url) throw new Error(`person ${payload.personId} has no linkedin_url`);

  const apiKey = Deno.env.get("FINDYMAIL_API_KEY");
  const { data: enrichment } = await supabase
    .from("enrichments")
    .insert({
      org_id: orgId,
      person_id: person.id,
      provider: "findymail",
      endpoint: "search/linkedin",
      request_payload: { linkedin_url: person.linkedin_url },
      outcome: "pending",
    })
    .select("id")
    .single();

  if (!apiKey) {
    await supabase
      .from("enrichments")
      .update({ outcome: "error", error_message: "FINDYMAIL_API_KEY not set" })
      .eq("id", enrichment.id);
    throw new Error("FINDYMAIL_API_KEY not set");
  }

  const res = await fetch(`${FINDYMAIL_BASE}/api/search/linkedin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ linkedin_url: person.linkedin_url }),
  });

  let email: string | null = null;
  let cost = 0;
  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { contact?: { email?: string } | null };
    email = body.contact?.email ?? null;
    cost = email ? 0.015 : 0;
  }

  await supabase.rpc("findymail_finalize", {
    p_enrichment_id: enrichment.id,
    p_email: email,
    p_run_cost_usd: cost,
  });

  if (email) {
    // Verify it via Instantly before queueing for sends.
    const { data: emailRow } = await supabase
      .from("emails")
      .select("id")
      .eq("person_id", person.id)
      .eq("email", email)
      .single();
    if (emailRow) {
      await enqueueJob(supabase, "verify_email_instantly", { emailId: emailRow.id }, orgId);
    }
    return { found: true, source: "findymail", email };
  }

  // Tier 1 miss -> escalate to SignalHire.
  await enqueueJob(supabase, "find_email_signalhire", { personId: person.id }, orgId);
  return { found: false, escalated: "signalhire" };
}

// ---------- SignalHire (tier 2, async via webhook) ----------

export async function handleFindEmailSignalhire(
  supabase: Supabase,
  payload: { personId: string },
  orgId: string,
) {
  const { data: person, error } = await supabase
    .from("people")
    .select("id, linkedin_url")
    .eq("id", payload.personId)
    .single();
  if (error || !person) throw new Error(`person ${payload.personId} not found`);
  if (!person.linkedin_url) throw new Error(`person ${payload.personId} has no linkedin_url`);

  const apiKey = Deno.env.get("SIGNALHIRE_API_KEY");
  const callbackSecret = Deno.env.get("SIGNALHIRE_CALLBACK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!apiKey || !callbackSecret || !supabaseUrl) {
    throw new Error("SIGNALHIRE secrets or SUPABASE_URL missing");
  }

  const { data: enrichment } = await supabase
    .from("enrichments")
    .insert({
      org_id: orgId,
      person_id: person.id,
      provider: "signalhire",
      endpoint: "candidate/search",
      request_payload: { items: [person.linkedin_url] },
      outcome: "pending",
    })
    .select("id")
    .single();

  const callbackUrl = `${supabaseUrl}/functions/v1/webhooks-signalhire?secret=${encodeURIComponent(
    callbackSecret,
  )}`;

  const res = await fetch(`${SIGNALHIRE_BASE}/candidate/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({ items: [person.linkedin_url], callbackUrl }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await supabase
      .from("enrichments")
      .update({ outcome: "error", error_message: `signalhire submit ${res.status}: ${text.slice(0, 200)}` })
      .eq("id", enrichment.id);
    throw new Error(`signalhire submit failed ${res.status}`);
  }

  const json = (await res.json()) as { requestId?: string };
  const requestId = json.requestId;
  if (!requestId) {
    await supabase
      .from("enrichments")
      .update({ outcome: "error", error_message: "signalhire response missing requestId" })
      .eq("id", enrichment.id);
    throw new Error("signalhire missing requestId");
  }

  await supabase.from("signalhire_pending_requests").insert({
    request_id: requestId,
    org_id: orgId,
    items: { person_id: person.id, enrichment_id: enrichment.id, linkedin_url: person.linkedin_url },
    status: "pending",
  });

  await supabase
    .from("enrichments")
    .update({ provider_request_id: requestId })
    .eq("id", enrichment.id);

  return { dispatched: true, requestId };
}

// ---------- Instantly verify (post-find tier) ----------

export async function handleVerifyEmailInstantly(
  supabase: Supabase,
  payload: { emailId: string },
  orgId: string,
) {
  const { data: row, error } = await supabase
    .from("emails")
    .select("id, email, person_id")
    .eq("id", payload.emailId)
    .single();
  if (error || !row) throw new Error(`email ${payload.emailId} not found`);

  const apiKey = Deno.env.get("INSTANTLY_API_KEY");
  const { data: enrichment } = await supabase
    .from("enrichments")
    .insert({
      org_id: orgId,
      person_id: row.person_id,
      provider: "instantly",
      endpoint: "email-verification",
      request_payload: { email: row.email },
      outcome: "pending",
    })
    .select("id")
    .single();

  if (!apiKey) {
    await supabase
      .from("enrichments")
      .update({ outcome: "error", error_message: "INSTANTLY_API_KEY not set" })
      .eq("id", enrichment.id);
    throw new Error("INSTANTLY_API_KEY not set");
  }

  const res = await fetch(`${INSTANTLY_BASE}/api/v2/email-verification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ email: row.email }),
  });
  const body = (await res.json().catch(() => ({}))) as { verification_status?: string };
  const status = body.verification_status ?? "unknown";

  await supabase.rpc("instantly_verify_finalize", {
    p_enrichment_id: enrichment.id,
    p_email_id: row.id,
    p_status: status,
    p_run_cost_usd: res.ok ? 0.0025 : 0,
  });

  return { status };
}

// ---------- Helpers ----------

export async function enqueueJob(
  supabase: Supabase,
  type: string,
  payload: Record<string, unknown>,
  orgId: string,
) {
  await supabase.rpc("pgmq_send", {
    queue_name: "jobs",
    msg: {
      type,
      payload,
      org_id: orgId,
      job_id: crypto.randomUUID(),
    },
  });
}
