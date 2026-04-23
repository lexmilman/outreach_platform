"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import type { Database } from "@/types/database";
import { DataGrid } from "./data-grid";
import { TextCell } from "./cells/text-cell";
import { CompanyChipCell, DateCell, NumberCell, UrlCell } from "./cells/cells";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";

type Row = Database["public"]["Tables"]["companies"]["Row"];

const PAGE_SIZE = 100;

export function CompaniesGrid({ initialRows }: { initialRows: Row[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [hasMore, setHasMore] = useState(initialRows.length === PAGE_SIZE);
  const [fetching, setFetching] = useState(false);

  useRealtimeTable<{ id: string; updated_at?: string | null }>({
    table: "companies",
    onUpsert: (row) => {
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.id === row.id);
        if (idx === -1) return prev;
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
      .from("companies")
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
        id: "name",
        header: "Company",
        size: 240,
        cell: ({ row }) => (
          <CompanyChipCell name={row.original.name} logo={row.original.logo_url} />
        ),
      },
      {
        accessorKey: "domain",
        header: "Domain",
        size: 180,
        cell: ({ row }) => <TextCell value={row.original.domain} />,
      },
      {
        accessorKey: "industry",
        header: "Industry",
        size: 180,
        cell: ({ row }) => <TextCell value={row.original.industry} />,
      },
      {
        accessorKey: "employee_count",
        header: "Employees",
        size: 110,
        cell: ({ row }) => <NumberCell value={row.original.employee_count} />,
      },
      {
        accessorKey: "hq_city",
        header: "HQ city",
        size: 140,
        cell: ({ row }) => <TextCell value={row.original.hq_city} />,
      },
      {
        accessorKey: "hq_country",
        header: "HQ country",
        size: 140,
        cell: ({ row }) => <TextCell value={row.original.hq_country} />,
      },
      {
        accessorKey: "website",
        header: "Website",
        size: 180,
        cell: ({ row }) => <UrlCell value={row.original.website} />,
      },
      {
        accessorKey: "linkedin_url",
        header: "LinkedIn",
        size: 160,
        cell: ({ row }) => <UrlCell value={row.original.linkedin_url} />,
      },
      {
        accessorKey: "created_at",
        header: "Added",
        size: 130,
        cell: ({ row }) => <DateCell value={row.original.created_at} />,
      },
    ],
    [],
  );

  const openDrawer = useCallback(
    (row: Row) => {
      const sp = new URLSearchParams(params.toString());
      sp.set("company", row.id);
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
          <h3 className="font-display text-lg font-semibold">No companies yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Company records are created alongside people during CSV import.
          </p>
        </div>
      }
    />
  );
}
