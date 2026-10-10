"use client";

import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePendingRouter } from "@/components/common/navigation-pending";
import { Pagination } from "./pagination";
import { useLocalPreference } from "./use-local-preference";
import { useUrlState } from "./use-url-state";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Server-side sort key; makes the header clickable. */
    sortKey?: string;
    align?: "start" | "end" | "center";
    className?: string;
    headerClassName?: string;
    /** Cannot be hidden from the column menu. */
    alwaysVisible?: boolean;
    /** Name shown in the column picker. */
    label?: string;
  }
}

type DataTableProps<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  data: T[];
  getRowId: (row: T) => string;
  rowHref?: (row: T) => string | null;
  pagination?: { page: number; pageSize: number; total: number; noun?: string };
  selectable?: boolean;
  bulkActions?: (selected: T[], clear: () => void) => React.ReactNode;
  /** Compact card rendering used below the md breakpoint instead of a wide table. */
  mobileCard?: (row: T) => React.ReactNode;
  empty?: React.ReactNode;
  /** Enables the column picker and remembers choices under this id. */
  tableId?: string;
  /** Usually a <FilterBar/>; shares a row with the column picker. */
  filters?: React.ReactNode;
  toolbar?: React.ReactNode;
  caption?: string;
  className?: string;
};

function SortIcon({ active, dir }: { active: boolean; dir: string | null }) {
  if (!active) return <ChevronsUpDown className="size-3.5 opacity-40 group-hover/sort:opacity-80" />;
  return dir === "desc" ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />;
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  rowHref,
  pagination,
  selectable = false,
  bulkActions,
  mobileCard,
  empty,
  tableId,
  filters,
  toolbar,
  caption,
  className,
}: DataTableProps<T>) {
  const router = usePendingRouter();
  const { get, set } = useUrlState();
  const sort = get("sort");
  const dir = get("dir");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [hidden, setHidden] = useLocalPreference<string[]>(`ea:cols:${tableId ?? "none"}`, []);
  const columnVisibility = useMemo<VisibilityState>(() => Object.fromEntries(hidden.map((id) => [id, false])), [hidden]);

  const allColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!selectable) return columns;
    return [
      {
        id: "__select",
        meta: { alwaysVisible: true, className: "w-10" },
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all rows on this page"
            checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(v === true)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(v === true)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },
      ...columns,
    ];
  }, [columns, selectable]);

  // TanStack Table returns non-memoizable functions; this component opts out of compiler memoization for it.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: allColumns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    enableRowSelection: selectable,
    state: { rowSelection, columnVisibility },
    onRowSelectionChange: setRowSelection,
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const clearSelection = () => setRowSelection({});
  const hideable = table.getAllLeafColumns().filter((c) => !c.columnDef.meta?.alwaysVisible && c.id !== "__select");

  const toggleSort = (key: string) => {
    if (sort !== key) set({ sort: key, dir: "asc" });
    else if (dir === "asc") set({ sort: key, dir: "desc" });
    else set({ sort: null, dir: null });
  };

  const open = (row: T) => {
    const href = rowHref?.(row);
    if (href) router.push(href);
  };
  // Rows behave like links: warm the destination as soon as the pointer arrives.
  const warm = (row: T) => {
    const href = rowHref?.(row);
    if (href) router.prefetch(href);
  };

  const rows = table.getRowModel().rows;

  return (
    <div className={cn("flex flex-col", className)}>
      {(filters || toolbar || tableId) && (
        <div className={cn("flex items-start gap-2", !filters && "mb-3")}>
          <div className="min-w-0 flex-1">{filters}</div>
          {toolbar}
          {tableId && hideable.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="hidden md:inline-flex">
                  <Columns3 /> Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-caption text-muted-foreground">Visible columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hideable.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(v) => setHidden(v ? hidden.filter((id) => id !== column.id) : [...hidden, column.id])}
                  >
                    {column.columnDef.meta?.label ?? column.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {selectable && selectedRows.length > 0 && bulkActions && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="sticky top-16 z-(--z-sticky) mb-3 flex animate-enter flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary-subtle px-3 py-2 shadow-sm"
        >
          <span className="text-small font-medium text-primary-subtle-foreground">{selectedRows.length} selected</span>
          <div className="flex flex-1 flex-wrap items-center gap-2">{bulkActions(selectedRows, clearSelection)}</div>
          <Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={clearSelection}>
            <X />
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        empty
      ) : (
        <>
          {/* Phones: cards instead of a wide table */}
          {mobileCard && (
            <ul className="flex flex-col gap-2 md:hidden">
              {rows.map((row) => (
                <li key={row.id}>
                  <div
                    role={rowHref ? "link" : undefined}
                    tabIndex={rowHref ? 0 : undefined}
                    onClick={() => open(row.original)}
                    onTouchStart={() => warm(row.original)}
                    onKeyDown={(e) => e.key === "Enter" && open(row.original)}
                    className={cn(
                      "rounded-xl border bg-card p-3.5 shadow-xs",
                      rowHref && "cursor-pointer transition-colors active:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    )}
                  >
                    {mobileCard(row.original)}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className={cn("overflow-hidden rounded-xl border bg-card shadow-xs", mobileCard && "hidden md:block")}>
            {/* Only wide tables scroll sideways; the page itself does the vertical scrolling (no nested scrollbars). */}
            <div className="overflow-x-auto">
              <table className="w-full caption-bottom text-small">
                {caption && <caption className="sr-only">{caption}</caption>}
                <thead className="bg-muted/60">
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b">
                      {hg.headers.map((header) => {
                        const meta = header.column.columnDef.meta;
                        const sortKey = meta?.sortKey;
                        const active = !!sortKey && sort === sortKey;
                        return (
                          <th
                            key={header.id}
                            scope="col"
                            aria-sort={active ? (dir === "desc" ? "descending" : "ascending") : undefined}
                            className={cn(
                              "h-10 px-4 text-start text-caption font-medium whitespace-nowrap text-muted-foreground",
                              meta?.align === "end" && "text-end",
                              meta?.align === "center" && "text-center",
                              meta?.headerClassName,
                              meta?.className,
                            )}
                          >
                            {header.isPlaceholder ? null : sortKey ? (
                              <button
                                type="button"
                                onClick={() => toggleSort(sortKey)}
                                className={cn(
                                  "group/sort -mx-1.5 inline-flex items-center gap-1 rounded-sm px-1.5 py-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                                  active && "text-foreground",
                                )}
                              >
                                {flexRender(header.column.columnDef.header, header.getContext())}
                                <SortIcon active={active} dir={dir} />
                              </button>
                            ) : (
                              flexRender(header.column.columnDef.header, header.getContext())
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      onMouseEnter={rowHref ? () => warm(row.original) : undefined}
                      onClick={(e) => {
                        // Let links/buttons inside cells handle their own clicks.
                        if ((e.target as HTMLElement).closest("a,button,[role=checkbox],input,label")) return;
                        open(row.original);
                      }}
                      className={cn(
                        "border-b transition-colors last:border-0 hover:bg-muted/40 data-[state=selected]:bg-primary-subtle/50",
                        rowHref && "cursor-pointer",
                      )}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const meta = cell.column.columnDef.meta;
                        return (
                          <td
                            key={cell.id}
                            className={cn(
                              "h-14 px-4 align-middle",
                              meta?.align === "end" && "text-end tabular",
                              meta?.align === "center" && "text-center",
                              meta?.className,
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {pagination && <Pagination {...pagination} />}
    </div>
  );
}
