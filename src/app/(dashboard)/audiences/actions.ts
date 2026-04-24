"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AudienceActionResult = { ok: true } | { ok: false; error: string };

const DeleteSchema = z.object({
  audienceId: z.string().uuid(),
  redirectToList: z.coerce.boolean().optional(),
});

/**
 * Delete an audience row. The `audience_members` cascade removes the join
 * rows; the global `people` and `companies` records stay put — they may
 * still be referenced by other audiences or by the enrichment pipeline.
 */
export async function deleteAudienceAction(formData: FormData): Promise<AudienceActionResult> {
  const parsed = DeleteSchema.safeParse({
    audienceId: formData.get("audienceId"),
    redirectToList: formData.get("redirectToList") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid input" };

  const supabase = await createClient();
  const { error } = await supabase.from("audiences").delete().eq("id", parsed.data.audienceId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/audiences");
  revalidatePath(`/audiences/${parsed.data.audienceId}`);

  if (parsed.data.redirectToList) {
    redirect("/audiences");
  }
  return { ok: true };
}
