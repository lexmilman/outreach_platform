"use client";

import { useEffect, useRef } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type RowWithId = { id: string; updated_at?: string | null };

type Options<T extends RowWithId> = {
  table: "people" | "companies" | "job_runs";
  onUpsert?: (row: T) => void;
  onDelete?: (id: string) => void;
  /** throttle in ms to coalesce bursts; default 300 */
  throttleMs?: number;
};

export function useRealtimeTable<T extends RowWithId>({
  table,
  onUpsert,
  onDelete,
  throttleMs = 300,
}: Options<T>) {
  const bufferRef = useRef<Map<string, T>>(new Map());
  const deletedRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpsertRef = useRef(onUpsert);
  const onDeleteRef = useRef(onDelete);
  onUpsertRef.current = onUpsert;
  onDeleteRef.current = onDelete;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime:${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload: RealtimePostgresChangesPayload<T>) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as Partial<T>)?.id;
            if (id) {
              deletedRef.current.add(id);
              bufferRef.current.delete(id);
            }
          } else {
            const row = payload.new as T;
            if (row?.id) bufferRef.current.set(row.id, row);
          }
          if (timerRef.current) return;
          timerRef.current = setTimeout(() => {
            const upserts = Array.from(bufferRef.current.values());
            const deletes = Array.from(deletedRef.current.values());
            bufferRef.current.clear();
            deletedRef.current.clear();
            timerRef.current = null;
            for (const r of upserts) onUpsertRef.current?.(r);
            for (const id of deletes) onDeleteRef.current?.(id);
          }, throttleMs);
        },
      )
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [table, throttleMs]);
}
