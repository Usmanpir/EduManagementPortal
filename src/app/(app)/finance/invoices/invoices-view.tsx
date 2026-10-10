"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { FilePlus2, Plus, Printer, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { OptionSelect } from "@/components/common/option-select";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { useUrlState } from "@/components/data/use-url-state";
import { INVOICE_STATUS, InvoiceStatusBadge } from "@/components/finance/finance-ui";
import { CreateInvoiceDrawer, GenerateInvoicesDrawer, type FeeOption } from "@/components/finance/invoice-drawers";
import { useHotkey } from "@/components/shell/shell-context";
import { formatDate, formatMoney } from "@/lib/format";

type Row = {
  id: string;
  invoiceNo: string;
  title: string;
  studentId: string;
  student: string;
  admissionNo: string;
  className: string | null;
  issueDate: string;
  dueDate: string;
  total: number;
  paid: number;
  balance: number;
  status: string;
};

export function InvoicesView({
  rows,
  total,
  totals,
  page,
  pageSize,
  hasFilters,
  classes,
  fees,
  currency,
  today,
  perms,
}: {
  rows: Row[];
  total: number;
  totals: { billed: number; collected: number };
  page: number;
  pageSize: number;
  hasFilters: boolean;
  classes: { value: string; label: string }[];
  fees: FeeOption[];
  currency: string;
  today: string;
  perms: { manage: boolean; record: boolean };
}) {
  const searchParams = useSearchParams();
  const { set } = useUrlState();
  const [create, setCreate] = useState({ open: perms.manage && searchParams.get("new") === "1", key: 0 });
  const [generate, setGenerate] = useState({ open: perms.manage && searchParams.get("generate") === "1", key: 0 });
  const openCreate = () => setCreate((d) => ({ open: true, key: d.key + 1 }));
  const openGenerate = () => setGenerate((d) => ({ open: true, key: d.key + 1 }));
  useHotkey("n", openCreate, perms.manage);
  const money = (v: number) => formatMoney(v, currency);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1));
    return { value: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) };
  });

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        meta: { sortKey: "student", alwaysVisible: true },
        cell: ({ row: { original: r } }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{r.student}</p>
            <p className="truncate text-caption text-muted-foreground">
              {r.className ?? "Not placed"} · {r.admissionNo}
            </p>
          </div>
        ),
      },
      {
        id: "invoice",
        header: "Invoice",
        meta: { label: "Invoice" },
        cell: ({ row: { original: r } }) => (
          <div className="min-w-0">
            <p className="tabular">{r.invoiceNo}</p>
            <p className="truncate text-caption text-muted-foreground">{r.title}</p>
          </div>
        ),
      },
      { id: "due", header: "Due", meta: { sortKey: "due", label: "Due date" }, cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.dueDate)}</span> },
      { id: "total", header: "Total", meta: { sortKey: "amount", align: "end", label: "Total" }, cell: ({ row }) => <span className="tabular">{formatMoney(row.original.total, currency)}</span> },
      { id: "paid", header: "Paid", meta: { align: "end", label: "Paid" }, cell: ({ row }) => <span className="tabular text-muted-foreground">{formatMoney(row.original.paid, currency)}</span> },
      { id: "balance", header: "Balance", meta: { align: "end", alwaysVisible: true }, cell: ({ row }) => <span className="tabular font-semibold">{row.original.balance > 0 ? formatMoney(row.original.balance, currency) : "—"}</span> },
      { id: "status", header: "Status", meta: { alwaysVisible: true }, cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} /> },
    ],
    [currency],
  );

  const filters = (
    <FilterBar
      searchPlaceholder="Search invoice no., student or admission no."
      filters={[
        { key: "status", label: "Status", multiple: true, options: Object.entries(INVOICE_STATUS).filter(([k]) => k !== "DRAFT").map(([value, s]) => ({ value, label: s.label })) },
        { key: "classId", label: "Class", multiple: true, options: classes },
      ]}
      actions={
        <div className="w-40">
          <OptionSelect ariaLabel="Billing month" value={searchParams.get("period")} onChange={(v) => set({ period: v, page: null })} options={months} noneLabel="All months" />
        </div>
      }
    />
  );

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Monthly fee bills and one-off charges."
        actions={
          perms.manage && (
            <>
              <Button variant="outline" onClick={openCreate}>
                <Plus /> One-off invoice
              </Button>
              <Button onClick={openGenerate}>
                <FilePlus2 /> Generate monthly
              </Button>
            </>
          )
        }
      />
      {total === 0 && !hasFilters ? (
        <EmptyState
          icon={Receipt}
          title="No invoices yet"
          description="Generate this month's fee invoices for every student in one go, or create a one-off invoice."
          actions={
            perms.manage && (
              <Button onClick={openGenerate}>
                <FilePlus2 /> Generate monthly invoices
              </Button>
            )
          }
        />
      ) : (
        <>
          {total > 0 && (
            <dl className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-small text-muted-foreground">
              <div className="flex gap-1.5">
                <dt>Billed</dt>
                <dd className="tabular font-medium text-foreground">{money(totals.billed)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Collected</dt>
                <dd className="tabular font-medium text-foreground">{money(totals.collected)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Balance</dt>
                <dd className="tabular font-medium text-foreground">{money(totals.billed - totals.collected)}</dd>
              </div>
            </dl>
          )}
          <DataTable
            filters={filters}
            tableId="invoices"
            columns={columns}
            data={rows}
            getRowId={(r) => r.id}
            rowHref={(r) => `/finance/invoices/${r.id}`}
            selectable
            bulkActions={(selected) => (
              <Button size="sm" variant="outline" asChild>
                <a href={`/finance/print/invoices?ids=${selected.map((s) => s.id).join(",")}`} target="_blank" rel="noreferrer">
                  <Printer /> Print {selected.length}
                </a>
              </Button>
            )}
            pagination={{ page, pageSize, total, noun: "invoices" }}
            caption="Invoices"
            mobileCard={(r) => (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.student}</p>
                  <p className="truncate text-small text-muted-foreground">
                    {r.title} · due {formatDate(r.dueDate)}
                  </p>
                </div>
                <div className="text-end">
                  <p className="tabular font-semibold">{money(r.balance > 0 ? r.balance : r.total)}</p>
                  <InvoiceStatusBadge status={r.status} />
                </div>
              </div>
            )}
            empty={<EmptyState icon={Receipt} title="No invoices match" description="Try a different search or clear the filters." />}
          />
        </>
      )}
      {perms.manage && (
        <>
          <CreateInvoiceDrawer key={`c${create.key}`} open={create.open} onOpenChange={(o) => setCreate((d) => ({ ...d, open: o }))} currency={currency} today={today} />
          <GenerateInvoicesDrawer key={`g${generate.key}`} open={generate.open} onOpenChange={(o) => setGenerate((d) => ({ ...d, open: o }))} fees={fees} classes={classes} currency={currency} today={today} />
        </>
      )}
    </div>
  );
}
