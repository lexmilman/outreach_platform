// @ts-nocheck
// Worker handlers for the Instantly side of Sprint 4.
//   1. handleInstantlyCreateCampaign — POST /api/v2/campaigns with the
//      sequence template attached to the campaign, then saves the returned
//      instantly_campaign_id on public.campaigns and flips status 'draft' -> 'ready'.
//   2. handlePushToInstantly — fetches a batch of pushable leads, renders
//      custom_variables from message_sequences, bulk-adds them via
//      /api/v2/leads/add, then marks them 'queued' in our DB.
//   3. handleSyncInstantlyStats — proxy that either syncs a single campaign
//      or iterates every running campaign, upserting into analytics_snapshots.
//
// Heavy work is kept off the request path: the cron ticker calls this from
// within EdgeRuntime.waitUntil.

import { recordCost } from "./cost.ts";
import type { createAdminClient } from "./supabase-admin.ts";

type Supabase = ReturnType<typeof createAdminClient>;

const INSTANTLY_BASE = "https://api.instantly.ai";

function isMock(): boolean {
  return Deno.env.get("MOCK_INSTANTLY") === "1" || !Deno.env.get("INSTANTLY_API_KEY");
}

function apiKey(): string | null {
  return Deno.env.get("INSTANTLY_API_KEY") ?? null;
}

// ---------- Create campaign in Instantly ----------

export async function handleInstantlyCreateCampaign(
  supabase: Supabase,
  payload: { campaignId: string },
  orgId: string,
) {
  const { data: camp, error } = await supabase
    .from("campaigns")
    .select("id, name, client_id, config, instantly_campaign_id")
    .eq("id", payload.campaignId)
    .single();
  if (error || !camp) throw new Error(`campaign ${payload.campaignId} not found`);
  if (camp.instantly_campaign_id) {
    return { alreadyCreated: true, instantly_campaign_id: camp.instantly_campaign_id };
  }

  const templateId = (camp.config as Record<string, unknown> | null)?.sequence_template_id as
    | string
    | undefined;
  if (!templateId) {
    throw new Error(`campaign ${camp.id} has no sequence_template_id in config`);
  }

  const { data: tpl, error: tplErr } = await supabase
    .from("sequence_templates")
    .select("id, steps")
    .eq("id", templateId)
    .single();
  if (tplErr || !tpl) throw new Error(`sequence_template ${templateId} not found`);

  const steps = Array.isArray(tpl.steps) ? tpl.steps : [];
  if (steps.length === 0) throw new Error(`sequence_template ${templateId} has no steps`);

  const body = {
    name: camp.name,
    sequences: [{ steps }],
  };

  let instantlyId: string;
  let rawResponse: unknown = null;

  if (isMock()) {
    instantlyId = `mock_camp_${camp.id.slice(0, 8)}`;
    rawResponse = { id: instantlyId, mock: true };
  } else {
    const started = Date.now();
    const res = await fetch(`${INSTANTLY_BASE}/api/v2/campaigns`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string };

    await recordCost(supabase, {
      orgId,
      clientId: camp.client_id,
      campaignId: camp.id,
      provider: "instantly",
      endpoint: "campaigns.create",
      outcome: res.ok && json.id ? "hit" : "error",
      usdCost: 0,
      latencyMs: Date.now() - started,
      requestPayload: body,
      responsePayload: json,
      errorCode: res.ok ? null : String(res.status),
      errorMessage: res.ok ? null : `HTTP ${res.status}`,
    });

    if (!res.ok || !json.id) {
      throw new Error(`instantly create campaign failed: ${res.status}`);
    }
    instantlyId = json.id;
    rawResponse = json;
  }

  await supabase
    .from("campaigns")
    .update({ instantly_campaign_id: instantlyId, status: "ready", updated_at: new Date().toISOString() })
    .eq("id", camp.id);

  await supabase
    .from("instantly_sync_state")
    .upsert({ campaign_id: camp.id, last_sync_at: null, last_cursor: null, stats: {} });

  return { ok: true, instantly_campaign_id: instantlyId, raw: rawResponse };
}

// ---------- Bulk push leads ----------

type PushableLead = {
  person_in_campaign_id: string;
  person_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  subject: string | null;
  email_copy_1: string | null;
  email_copy_2: string | null;
  email_copy_3: string | null;
  email_copy_4: string | null;
  personalization: string | null;
  waterfall_lead_id: string | null;
  tier: number | null;
  linkedin_url: string | null;
  current_title: string | null;
  location: string | null;
};

export async function handlePushToInstantly(
  supabase: Supabase,
  payload: { campaignId: string; personInCampaignIds: string[] },
  orgId: string,
) {
  const { data: camp, error } = await supabase
    .from("campaigns")
    .select("id, client_id, instantly_campaign_id, status")
    .eq("id", payload.campaignId)
    .single();
  if (error || !camp) throw new Error(`campaign ${payload.campaignId} not found`);
  if (!camp.instantly_campaign_id) {
    throw new Error(`campaign ${camp.id} has no instantly_campaign_id — create it first`);
  }

  const { data: leads, error: leadsErr } = await supabase
    .from("people_in_campaign")
    .select(`
      id, person_id, email_used, waterfall_lead_id,
      person:people(first_name, last_name, linkedin_url, current_title, location, current_company_id),
      sequence:message_sequences!inner(subject, email_copy_1, email_copy_2, email_copy_3, email_copy_4, personalization, pushed_to_instantly_at)
    `)
    .eq("campaign_id", camp.id)
    .in("id", payload.personInCampaignIds)
    .is("instantly_lead_id", null);
  if (leadsErr) throw new Error(`leads fetch failed: ${leadsErr.message}`);
  if (!leads || leads.length === 0) {
    return { pushed: 0, skipped: payload.personInCampaignIds.length };
  }

  const mapped: PushableLead[] = leads
    .filter((l: Record<string, unknown>) => l.email_used && (l.sequence as { subject?: string | null })?.subject)
    .map((l: Record<string, unknown>) => {
      const person = (l.person ?? {}) as Record<string, string | null>;
      const seq = (l.sequence ?? {}) as Record<string, string | null>;
      return {
        person_in_campaign_id: l.id as string,
        person_id: l.person_id as string,
        email: l.email_used as string,
        first_name: person.first_name ?? null,
        last_name: person.last_name ?? null,
        company_name: null,
        subject: seq.subject ?? null,
        email_copy_1: seq.email_copy_1 ?? null,
        email_copy_2: seq.email_copy_2 ?? null,
        email_copy_3: seq.email_copy_3 ?? null,
        email_copy_4: seq.email_copy_4 ?? null,
        personalization: seq.personalization ?? null,
        waterfall_lead_id: (l.waterfall_lead_id as string | null) ?? null,
        tier: null,
        linkedin_url: person.linkedin_url ?? null,
        current_title: person.current_title ?? null,
        location: person.location ?? null,
      };
    });

  if (mapped.length === 0) {
    return { pushed: 0, skipped: payload.personInCampaignIds.length, reason: "no eligible leads" };
  }

  const instantlyLeads = mapped.map((l) => ({
    email: l.email,
    first_name: l.first_name ?? undefined,
    last_name: l.last_name ?? undefined,
    company_name: l.company_name ?? undefined,
    custom_variables: {
      subject: l.subject ?? undefined,
      email_copy_1: l.email_copy_1 ?? undefined,
      email_copy_2: l.email_copy_2 ?? undefined,
      email_copy_3: l.email_copy_3 ?? undefined,
      email_copy_4: l.email_copy_4 ?? undefined,
      personalization: l.personalization ?? undefined,
      linkedin_url: l.linkedin_url ?? undefined,
      title: l.current_title ?? undefined,
      location: l.location ?? undefined,
      waterfall_lead_id: l.waterfall_lead_id ?? undefined,
    },
  }));

  let added = 0;
  let rawResponse: unknown = null;
  if (isMock()) {
    added = instantlyLeads.length;
    rawResponse = { mock: true, added };
  } else {
    const started = Date.now();
    const res = await fetch(`${INSTANTLY_BASE}/api/v2/leads/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify({ campaign_id: camp.instantly_campaign_id, leads: instantlyLeads }),
    });
    const json = (await res.json().catch(() => ({}))) as { added?: number };

    await recordCost(supabase, {
      orgId,
      clientId: camp.client_id,
      campaignId: camp.id,
      provider: "instantly",
      endpoint: "leads.add",
      outcome: res.ok ? "hit" : "error",
      usdCost: 0,
      units: instantlyLeads.length,
      unitType: "result",
      latencyMs: Date.now() - started,
      requestPayload: { campaign_id: camp.instantly_campaign_id, lead_count: instantlyLeads.length },
      responsePayload: json,
      errorCode: res.ok ? null : String(res.status),
      errorMessage: res.ok ? null : `HTTP ${res.status}`,
    });

    if (!res.ok) {
      throw new Error(`instantly bulk add failed: ${res.status}`);
    }
    added = json.added ?? instantlyLeads.length;
    rawResponse = json;
  }

  const pushedIds = mapped.map((l) => l.person_in_campaign_id);
  const { data: markedCount, error: markErr } = await supabase.rpc("mark_leads_pushed", {
    p_campaign_id: camp.id,
    p_ids: pushedIds,
  });
  if (markErr) console.error("mark_leads_pushed failed", markErr);

  return { pushed: added, marked: markedCount ?? 0, skipped: payload.personInCampaignIds.length - mapped.length, raw: rawResponse };
}

// ---------- Daily analytics sync ----------

type InstantlyAnalytics = {
  campaign_id: string;
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
  clicked: number;
  completed: number;
  total_interested: number;
  total_meeting_booked: number;
  positive_replied: number;
};

async function fetchAnalytics(instantlyCampaignId: string): Promise<InstantlyAnalytics | null> {
  if (isMock()) {
    return {
      campaign_id: instantlyCampaignId,
      sent: 0,
      opened: 0,
      replied: 0,
      bounced: 0,
      unsubscribed: 0,
      clicked: 0,
      completed: 0,
      total_interested: 0,
      total_meeting_booked: 0,
      positive_replied: 0,
    };
  }
  const res = await fetch(
    `${INSTANTLY_BASE}/api/v2/campaigns/analytics/overview?id=${encodeURIComponent(instantlyCampaignId)}`,
    { headers: { Authorization: `Bearer ${apiKey()}` } },
  );
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!json) return null;
  const num = (k: string) => Number(json[k] ?? 0) || 0;
  return {
    campaign_id: String(json.campaign_id ?? instantlyCampaignId),
    sent: num("sent"),
    opened: num("opened"),
    replied: num("replied"),
    bounced: num("bounced"),
    unsubscribed: num("unsubscribed"),
    clicked: num("clicked"),
    completed: num("completed"),
    total_interested: num("total_interested"),
    total_meeting_booked: num("total_meeting_booked"),
    positive_replied: num("positive_replied"),
  };
}

export async function handleSyncInstantlyStats(
  supabase: Supabase,
  payload: { campaignId?: string },
  _orgId: string,
) {
  const query = supabase
    .from("campaigns")
    .select("id, org_id, client_id, instantly_campaign_id, status")
    .not("instantly_campaign_id", "is", null)
    .in("status", ["draft", "ready", "running", "paused", "completed"]);
  if (payload.campaignId) query.eq("id", payload.campaignId);

  const { data: rows, error } = await query;
  if (error) throw new Error(`campaigns fetch failed: ${error.message}`);
  if (!rows || rows.length === 0) return { synced: 0 };

  const today = new Date().toISOString().slice(0, 10);
  let synced = 0;
  for (const camp of rows as Array<{ id: string; org_id: string; instantly_campaign_id: string }>) {
    const a = await fetchAnalytics(camp.instantly_campaign_id);
    if (!a) continue;

    await supabase.from("analytics_snapshots").upsert(
      {
        org_id: camp.org_id,
        campaign_id: camp.id,
        day: today,
        sent: a.sent,
        opened: a.opened,
        replied: a.replied,
        bounced: a.bounced,
        unsubscribed: a.unsubscribed,
        clicked: a.clicked,
        completed: a.completed,
        total_interested: a.total_interested,
        total_meeting_booked: a.total_meeting_booked,
        positive_replied: a.positive_replied,
        raw_payload: a,
      },
      { onConflict: "campaign_id,day" },
    );

    await supabase
      .from("instantly_sync_state")
      .upsert({ campaign_id: camp.id, last_sync_at: new Date().toISOString(), stats: a });

    synced += 1;
  }
  return { synced };
}
