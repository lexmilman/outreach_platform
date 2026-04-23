"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "@/lib/auth/current-org";
import { mapRows, type ColumnMapping } from "@/lib/csv/map-rows";
import { runImport, MAX_ROWS_PER_IMPORT, type ImportReport } from "@/lib/csv/import";

const ColumnMappingSchema = z.object({
  csvHeader: z.string(),
  canonical: z.string().nullable(),
});

const ImportPayloadSchema = z.object({
  clientId: z.string().uuid().optional().nullable(),
  audienceName: z.string().trim().min(1).max(200),
  mappings: z.array(ColumnMappingSchema).min(1),
  rows: z.array(z.record(z.string(), z.string())).max(MAX_ROWS_PER_IMPORT),
});

export type ImportPayload = z.infer<typeof ImportPayloadSchema>;

export type ImportActionResult =
  | { ok: true; report: ImportReport; audienceId: string }
  | { ok: false; error: string };

export async function importCsvAction(input: ImportPayload): Promise<ImportActionResult> {
  const parsed = ImportPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const orgId = await currentOrgId();
  if (!orgId) return { ok: false, error: "No organization found for your account." };

  const supabase = await createClient();
  const { mapped, rejected } = mapRows(
    parsed.data.rows,
    parsed.data.mappings as ColumnMapping[],
  );

  if (mapped.length === 0) {
    return { ok: false, error: "No valid rows found after mapping. Check your column mappings." };
  }

  // Create the audience row up front so the user has something to navigate to.
  const { data: audience, error: audienceErr } = await supabase
    .from("audiences")
    .insert({
      org_id: orgId,
      client_id: parsed.data.clientId ?? null,
      name: parsed.data.audienceName,
      source: "csv",
      row_count: mapped.length,
    })
    .select("id")
    .single();

  if (audienceErr || !audience) {
    return { ok: false, error: audienceErr?.message ?? "Failed to create audience" };
  }

  try {
    const counts = await runImport(
      supabase,
      mapped.map((m) => m.lead),
    );

    const report: ImportReport = {
      totalRows: parsed.data.rows.length,
      ...counts,
      rejected: rejected.map((r) => ({ index: r.index, reason: r.reason })),
    };

    revalidatePath("/audiences");
    revalidatePath("/people");
    revalidatePath("/companies");
    return { ok: true, report, audienceId: audience.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Import failed" };
  }
}
