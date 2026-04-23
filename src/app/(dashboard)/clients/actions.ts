"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ClientCreateSchema, ClientIdSchema, ClientUpdateSchema } from "@/lib/schemas/client";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "@/lib/auth/current-org";
import { slugify } from "@/lib/utils";

export type ActionState = { ok: boolean; error?: string };

export async function createClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = {
    name: formData.get("name"),
    slug: (formData.get("slug") as string | null)?.trim() || undefined,
    icp_description: formData.get("icp_description") || null,
    brand_voice: formData.get("brand_voice") || null,
  };
  const parsed = ClientCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const orgId = await currentOrgId();
  if (!orgId) return { ok: false, error: "No organization found for your account." };

  const supabase = await createClient();
  const slug = parsed.data.slug ?? slugify(parsed.data.name);

  const { data, error } = await supabase
    .from("clients")
    .insert({
      org_id: orgId,
      name: parsed.data.name,
      slug,
      icp_description: parsed.data.icp_description ?? null,
      brand_voice: parsed.data.brand_voice ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/clients");
  redirect(`/clients/${data.id}`);
}

export async function updateClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = {
    id: formData.get("id"),
    name: formData.get("name"),
    slug: (formData.get("slug") as string | null)?.trim() || undefined,
    icp_description: formData.get("icp_description") || null,
    brand_voice: formData.get("brand_voice") || null,
    is_archived: formData.get("is_archived") === "on" || undefined,
  };
  const parsed = ClientUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { id, ...rest } = parsed.data;
  const { error } = await supabase.from("clients").update(rest).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { ok: true };
}

export async function archiveClientAction(formData: FormData): Promise<void> {
  const parsed = ClientIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.from("clients").update({ is_archived: true }).eq("id", parsed.data.id);
  revalidatePath("/clients");
  redirect("/clients");
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const parsed = ClientIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.from("clients").delete().eq("id", parsed.data.id);
  revalidatePath("/clients");
  redirect("/clients");
}
