"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const EDITABLE_FIELDS = [
  "first_name",
  "last_name",
  "full_name",
  "current_title",
  "location",
  "country",
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

const UpdateSchema = z.object({
  id: z.string().uuid(),
  field: z.enum(EDITABLE_FIELDS),
  value: z.string().trim().max(400).nullable(),
});

export type UpdatePersonResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updatePersonFieldAction(input: {
  id: string;
  field: EditableField;
  value: string | null;
}): Promise<UpdatePersonResult> {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const args: Record<string, string | null> = {
    p_id: parsed.data.id,
  };
  args[`p_${parsed.data.field}`] = parsed.data.value ?? null;

  const { error } = await supabase.rpc("update_person_fields", args as never);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/people");
  return { ok: true };
}
