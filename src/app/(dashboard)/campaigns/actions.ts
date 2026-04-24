"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CampaignCreateSchema, CampaignPushSchema } from "@/lib/schemas/campaign";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "@/lib/auth/current-org";
import { enqueueJob } from "@/lib/queue/dispatch";

export type ActionState = { ok: boolean; error?: string; message?: string };

export async function createCampaignAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = {
    name: formData.get("name"),
    client_id: formData.get("client_id"),
    audience_id: (formData.get("audience_id") as string | null)?.trim() || undefined,
    sequence_template_id: formData.get("sequence_template_id"),
  };
  const parsed = CampaignCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const orgId = await currentOrgId();
  if (!orgId) return { ok: false, error: "No organization found for your account." };

  const supabase = await createClient();

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, org_id")
    .eq("id", parsed.data.client_id)
    .maybeSingle();
  if (clientErr || !client) return { ok: false, error: "Client not found." };
  if (client.org_id !== orgId) return { ok: false, error: "Client not in your organization." };

  const { data: tpl, error: tplErr } = await supabase
    .from("sequence_templates")
    .select("id, org_id")
    .eq("id", parsed.data.sequence_template_id)
    .maybeSingle();
  if (tplErr || !tpl) return { ok: false, error: "Sequence template not found." };
  if (tpl.org_id !== orgId) return { ok: false, error: "Template not in your organization." };

  const { data: camp, error } = await supabase
    .from("campaigns")
    .insert({
      org_id: orgId,
      client_id: parsed.data.client_id,
      audience_id: parsed.data.audience_id ?? null,
      name: parsed.data.name,
      status: "draft",
      config: { sequence_template_id: parsed.data.sequence_template_id },
    })
    .select("id")
    .single();
  if (error || !camp) return { ok: false, error: error?.message ?? "Create failed" };

  const enqueued = await enqueueJob({
    type: "instantly_create_campaign",
    payload: { campaignId: camp.id },
    orgId,
  });
  if (!enqueued.ok) {
    // The campaign is already in the DB as 'draft'; surface the error so the
    // operator can retry from the detail page.
    return { ok: false, error: `queued draft but enqueue failed: ${enqueued.error}` };
  }

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${camp.id}`);
  redirect(`/campaigns/${camp.id}`);
}

export async function retryCreateInstantlyCampaignAction(formData: FormData): Promise<void> {
  const campaignId = formData.get("campaign_id");
  if (typeof campaignId !== "string") return;

  const orgId = await currentOrgId();
  if (!orgId) return;

  await enqueueJob({
    type: "instantly_create_campaign",
    payload: { campaignId },
    orgId,
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function pushLeadsToInstantlyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = CampaignPushSchema.safeParse({
    campaign_id: formData.get("campaign_id"),
    limit: formData.get("limit") ?? 100,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const orgId = await currentOrgId();
  if (!orgId) return { ok: false, error: "No organization." };

  const supabase = await createClient();
  const { data: leads, error } = await supabase.rpc("list_pushable_leads", {
    p_campaign_id: parsed.data.campaign_id,
    p_limit: parsed.data.limit,
  });
  if (error) return { ok: false, error: error.message };
  if (!leads || leads.length === 0) {
    return { ok: true, message: "No pushable leads right now." };
  }

  const ids = (leads as Array<{ person_in_campaign_id: string }>).map((l) => l.person_in_campaign_id);
  const enqueued = await enqueueJob({
    type: "push_to_instantly",
    payload: { campaignId: parsed.data.campaign_id, personInCampaignIds: ids },
    orgId,
  });
  if (!enqueued.ok) return { ok: false, error: enqueued.error };

  revalidatePath(`/campaigns/${parsed.data.campaign_id}`);
  return { ok: true, message: `Enqueued push for ${ids.length} leads.` };
}

export async function syncCampaignStatsAction(formData: FormData): Promise<void> {
  const campaignId = formData.get("campaign_id");
  if (typeof campaignId !== "string") return;
  const orgId = await currentOrgId();
  if (!orgId) return;
  await enqueueJob({
    type: "sync_instantly_stats",
    payload: { campaignId },
    orgId,
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function archiveCampaignAction(formData: FormData): Promise<void> {
  const campaignId = formData.get("campaign_id");
  if (typeof campaignId !== "string") return;
  const supabase = await createClient();
  await supabase.from("campaigns").update({ status: "archived" }).eq("id", campaignId);
  revalidatePath("/campaigns");
  redirect("/campaigns");
}
