"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ReplayResult = { ok: true; newMsgId: number } | { ok: false; error: string };

const ReplaySchema = z.object({ msgId: z.coerce.number().int().positive() });

export async function replayDlqAction(formData: FormData): Promise<ReplayResult> {
  const parsed = ReplaySchema.safeParse({ msgId: formData.get("msgId") });
  if (!parsed.success) return { ok: false, error: "invalid msg id" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("replay_dlq", { p_msg_id: parsed.data.msgId });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/jobs");
  return { ok: true, newMsgId: Number(data) };
}
