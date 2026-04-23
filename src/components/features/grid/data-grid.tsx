"use client";

import { useCallback, useMemo, useRef } from "react";
import {
  type ColumnDef,
  type OnChangeFn,
  type Row,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 40;
const OVERSCAN = 10;

export type DataGridProps<T> = {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  onRowClick?: (row: T) => void;
  fetchMore?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  className?: string;
  emptyState?: React.ReactNode;
};

export function DataGrid<T>({
  data,
  columns,
  onRowClick,
  fetchMore,
  hasNextPage,
  isFetchingNextPage,
  sorting,
  onSortingChange,
  columnVisibility,
  onColumnVisibilityChange,
  className,
  emptyState,
}: DataGridProps<T>) {
  const memoColumns = useMemo(() => columns, [columns]);

  const table = useReactTable({
    data,
    columns: memoColumns,
    state: { sorting, columnVisibility },
    onSortingChange,
    onColumnVisibilityChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: "onEnd",
    defaultColumn: { size: 180, minSize: 60, maxSize: 640 },
  });

  const { rows } = table.getRowModel();
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? rows.length + 1 : rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const visibleItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const handleScroll = useCallback(() => {
    if (!fetchMore || !hasNextPage || isFetchingNextPage) return;
    const el = parentRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < ROW_HEIGHT * OVERSCAN) {
      fetchMore();
    }
  }, [fetchMore, hasNextPage, isFetchingNextPage]);

  if (data.length === 0 && !isFetchingNextPage) {
    return <div className="rounded-xl border bg-card p-10">{emptyState}</div>;
  }

  return (
    <div
      ref={parentRef}
      onScroll={handleScroll}
      className={cn(
        "relative max-h-[calc(100vh-13rem)] overflow-auto rounded-xl border bg-card",
        className,
      )}
      role="grid"
    >
      <table className="w-full border-separate border-spacing-0" style={{ minWidth: table.getTotalSize() }}>
        <thead className="sticky top-0 z-10 bg-card">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                return (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="group relative h-10 border-b border-r bg-card px-2 text-left align-middle text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    <button
                      type="button"
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      className={cn(
                        "flex h-full w-full items-center gap-1",
                        canSort && "cursor-pointer hover:text-foreground",
                      )}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort ? (
                        sorted === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : sorted === "desc" ? (
                          <ArrowDown className="size-3" />
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-0 group-hover:opacity-50" />
                        )
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody className="relative" style={{ height: `${totalSize}px`, display: "block" }}>
          {visibleItems.map((virtualRow) => {
            const isLoader = virtualRow.index > rows.length - 1;
            const row = rows[virtualRow.index] as Row<T> | undefined;
            return (
              <tr
                key={virtualRow.key}
                ref={(node) => rowVirtualizer.measureElement(node)}
                data-index={virtualRow.index}
                onClick={() => row && onRowClick?.(row.original)}
                className={cn(
                  "absolute left-0 flex w-full items-stretch border-b transition-colors",
                  row && onRowClick ? "cursor-pointer hover:bg-accent/40" : undefined,
                )}
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  height: `${ROW_HEIGHT}px`,
                }}
              >
                {isLoader ? (
                  <td className="flex w-full items-center justify-center text-xs text-muted-foreground">
                    Loading more…
                  </td>
                ) : row ? (
                  row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className="flex items-center border-r last:border-r-0"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
