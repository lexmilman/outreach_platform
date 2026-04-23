"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import type { Database } from "@/types/database";
import { DataGrid } from "./data-grid";
import { TextCell } from "./cells/text-cell";
import {
  AvatarCell,
  CompanyChipCell,
  DateCell,
  EmailCell,
  NumberCell,
  UrlCell,
} from "./cells/cells";
import { createClient } from "@/lib/supabase/client";
import { useCommitPersonCell } from "@/hooks/use-commit-cell";
import { useRealtimeTable } from "@/hooks/use-realtime-table";

type Row = Database["public"]["Views"]["v_people_with_company"]["Row"];

const PAGE_SIZE = 100;

export function PeopleGrid({ initialRows }: { initialRows: Row[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [hasMore, setHasMore] = useState(initialRows.length === PAGE_SIZE);
  const [fetching, setFetching] = useState(false);

  const { commit } = useCommitPersonCell({
    onOptimistic: (id, field, value) =>
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
      ),
    onRollback: (id, field, previous) =>
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [field]: previous } : r)),
      ),
  });

  useRealtimeTable<{ id: string; updated_at?: string | null }>({
    table: "people",
    onUpsert: (row) => {
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.id === row.id);
        if (idx === -1) return prev;
        // Merge only — don't add rows that weren't in the paged window.
        const next = [...prev];
        next[idx] = { ...next[idx], ...row } as Row;
        return next;
      });
    },
    onDelete: (id) => setRows((prev) => prev.filter((r) => r.id !== id)),
  });

  const fetchMore = useCallback(async () => {
    if (fetching || !hasMore) return;
    setFetching(true);
    const supabase = createClient();
    const from = rows.length;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from("v_people_with_company")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (data && data.length > 0) {
      setRows((prev) => [...prev, ...(data as Row[])]);
      setHasMore(data.length === PAGE_SIZE);
    } else {
      setHasMore(false);
    }
    setFetching(false);
  }, [rows.length, fetching, hasMore]);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        id: "avatar",
        header: "",
        size: 56,
        enableSorting: false,
        cell: ({ row }) => (
          <AvatarCell src={row.original.photo_url} name={row.original.full_name} />
        ),
      },
      {
        accessorKey: "full_name",
        header: "Name",
        size: 200,
        cell: ({ row }) => (
          <TextCell
            value={row.original.full_name}
            editable
            onCommit={(next) =>
              commit({
                id: row.original.id,
                field: "full_name",
                value: next,
                previous: row.original.full_name ?? null,
              })
            }
          />
        ),
      },
      {
        accessorKey: "current_title",
        header: "Title",
        size: 220,
        cell: ({ row }) => (
          <TextCell
            value={row.original.current_title}
            editable
            onCommit={(next) =>
              commit({
                id: row.original.id,
                field: "current_title",
                value: next,
                previous: row.original.current_title ?? null,
              })
            }
          />
        ),
      },
      {
        id: "company",
        header: "Company",
        size: 200,
        cell: ({ row }) => (
          <CompanyChipCell name={row.original.company_name} logo={row.original.company_logo_url} />
        ),
      },
      {
        accessorKey: "location",
        header: "Location",
        size: 160,
        cell: ({ row }) => (
          <TextCell
            value={row.original.location}
            editable
            onCommit={(next) =>
              commit({
                id: row.original.id,
                field: "location",
                value: next,
                previous: row.original.location ?? null,
              })
            }
          />
        ),
      },
      {
        id: "email",
        header: "Email",
        size: 200,
        cell: ({ row }) => {
          const email = (row.original.data_json as { email?: string } | null)?.email ?? null;
          return <EmailCell value={email} />;
        },
      },
      {
        accessorKey: "linkedin_url",
        header: "LinkedIn",
        size: 160,
        cell: ({ row }) => <UrlCell value={row.original.linkedin_url} />,
      },
      {
        accessorKey: "connections_count",
        header: "Conns.",
        size: 90,
        cell: ({ row }) => <NumberCell value={row.original.connections_count} />,
      },
      {
        accessorKey: "created_at",
        header: "Added",
        size: 130,
        cell: ({ row }) => <DateCell value={row.original.created_at} />,
      },
    ],
    [commit],
  );

  const openDrawer = useCallback(
    (row: Row) => {
      const sp = new URLSearchParams(params.toString());
      sp.set("person", row.id);
      router.replace(`?${sp.toString()}`, { scroll: false });
    },
    [params, router],
  );

  return (
    <DataGrid
      data={rows}
      columns={columns}
      sorting={sorting}
      onSortingChange={setSorting}
      fetchMore={fetchMore}
      hasNextPage={hasMore}
      isFetchingNextPage={fetching}
      onRowClick={openDrawer}
      emptyState={
        <div className="text-center">
          <h3 className="font-display text-lg font-semibold">No people yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Import a CSV or run enrichment to populate the DB.
          </p>
        </div>
      }
    />
  );
}
