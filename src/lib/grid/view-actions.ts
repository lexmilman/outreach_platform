"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId, currentUserId } from "@/lib/auth/current-org";

const ColumnStateSchema = z.object({
  columnOrder: z.array(z.string()).optional(),
  columnVisibility: z.record(z.string(), z.boolean()).optional(),
  columnSizing: z.record(z.string(), z.number()).optional(),
  columnPinning: z
    .object({
      left: z.array(z.string()).optional(),
      right: z.array(z.string()).optional(),
    })
    .optional(),
});

const SaveViewSchema = z.object({
  entity: z.enum(["people", "companies"]),
  name: z.string().trim().min(1).max(120).default("Default"),
  columnState: ColumnStateSchema,
  filters: z.array(z.unknown()).default([]),
  sorts: z.array(z.unknown()).default([]),
});

export type SaveViewInput = z.infer<typeof SaveViewSchema>;

export async function saveDefaultView(input: SaveViewInput) {
  const parsed = SaveViewSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid view" };

  const orgId = await currentOrgId();
  const userId = await currentUserId();
  if (!orgId || !userId) return { ok: false as const, error: "unauthenticated" };

  const supabase = await createClient();
  const { error } = await supabase.from("table_views").upsert(
    {
      user_id: userId,
      org_id: orgId,
      entity: parsed.data.entity,
      name: parsed.data.name,
      column_state: parsed.data.columnState,
      filters: parsed.data.filters as unknown as never,
      sorts: parsed.data.sorts as unknown as never,
      is_default: true,
    },
    { onConflict: "user_id,org_id,entity,name" },
  );
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
