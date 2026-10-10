"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Banknote, Plus, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { useUrlState } from "@/components/data/use-url-state";
import { METHOD_LABELS } from "@/components/finance/finance-ui";
import { PaymentDrawer } from "@/components/finance/payment-drawer";
import { useHotkey } from "@/components/shell/shell-context";
import { formatDate, formatMoney } from "@/lib/format";
import { DatePicker } from "@/components/common/date-pickers";

type Row = {
  id: string;
  receiptNo: string;
  invoiceId: string;
  invoiceNo: string;
  studentId: string;
  student: string;
  admissionNo: string;
  amount: number;
  method: string;
  reference: string | null;
  paidAt: string;
  status: string;
};

export function PaymentsView({ rows, total, sum, page, pageSize, hasFilters, currency, today, canRecord }: { rows: Row[]; total: number; sum: number; page: number; pageSize: number; hasFilters: boolean; currency: string; today: string; canRecord: boolean }) {
  const searchParams = useSearchParams();
  const { set } = useUrlState();
  const [drawer, setDrawer] = useState({ open: canRecord && searchParams.get("new") === "1", key: 0 });
  const open = () => setDrawer((d) => ({ open: true, key: d.key + 1 }));
  useHotkey("n", open, canRecord);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "receipt",
        header: "Receipt",
        meta: { alwaysVisible: true },
        cell: ({ row: { original: r } }) => (
          <span className="tabular">
            {r.receiptNo}
            {r.status === "VOIDED" && (
              <Badge variant="neutral" className="ms-2">
                Voided
              </Badge>
            )}
          </span>
        ),
      },
      { id: "date", header: "Date", meta: { label: "Date" }, cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.paidAt)}</span> },
      {
        id: "student",
        header: "Student",
        meta: { alwaysVisible: true },
        cell: ({ row: { original: r } }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{r.student}</p>
            <p className="text-caption text-muted-foreground">
              {r.admissionNo} · {r.invoiceNo}
            </p>
          </div>
        ),
      },
      {
        id: "method",
        header: "Method",
        meta: { label: "Method" },
        cell: ({ row: { original: r } }) => (
          <span>
            {METHOD_LABELS[r.method]}
            {r.reference && <span className="block text-caption text-muted-foreground">{r.reference}</span>}
          </span>
        ),
      },
      {
        id: "amount",
        header: "Amount",
        meta: { align: "end", alwaysVisible: true },
        cell: ({ row: { original: r } }) => <span className={r.status === "VOIDED" ? "tabular text-muted-foreground line-through" : "tabular font-semibold"}>{formatMoney(r.amount, currency)}</span>,
      },
      {
        id: "print",
        header: () => <span className="sr-only">Receipt</span>,
        meta: { align: "end", alwaysVisible: true },
        cell: ({ row: { original: r } }) =>
          r.status === "COMPLETED" && (
            <Button variant="ghost" size="icon-sm" asChild>
              <a href={`/finance/print/receipt/${r.id}`} target="_blank" rel="noreferrer" aria-label={`Print receipt ${r.receiptNo}`} onClick={(e) => e.stopPropagation()}>
                <Printer />
              </a>
            </Button>
          ),
      },
    ],
    [currency],
  );

  const filters = (
    <FilterBar
      searchPlaceholder="Search receipt, invoice, student or reference"
      filters={[{ key: "method", label: "Method", multiple: true, options: Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label })) }]}
      actions={
        <div className="flex items-center gap-1.5">
          <DatePicker clearable ariaLabel="From date" className="h-9 w-38" value={searchParams.get("from") ?? ""} max={today} onChange={(v) => set({ from: v || null, page: null })} />
          <span className="text-muted-foreground">–</span>
          <DatePicker clearable ariaLabel="To date" className="h-9 w-38" value={searchParams.get("to") ?? ""} max={today} onChange={(v) => set({ to: v || null, page: null })} />
        </div>
      }
    />
  );

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Every fee payment received, with printable receipts."
        actions={
          canRecord && (
            <Button onClick={open}>
              <Plus /> Record payment
            </Button>
          )
        }
      />
      {total === 0 && !hasFilters ? (
        <EmptyState icon={Banknote} title="No payments yet" description="Record fees received at the counter, by bank transfer or mobile wallet. Each payment gets a receipt." actions={canRecord && <Button onClick={open}><Plus /> Record payment</Button>} />
      ) : (
        <>
          {total > 0 && (
            <p className="mb-3 text-small text-muted-foreground">
              {hasFilters ? "Collected (matching)" : "Collected (all time)"} <span className="tabular font-medium text-foreground">{formatMoney(sum, currency)}</span>
            </p>
          )}
          <DataTable
            filters={filters}
            tableId="payments"
            columns={columns}
            data={rows}
            getRowId={(r) => r.id}
            rowHref={(r) => `/finance/invoices/${r.invoiceId}`}
            pagination={{ page, pageSize, total, noun: "payments" }}
            caption="Payments"
            mobileCard={(r) => (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.student}</p>
                  <p className="text-small text-muted-foreground">
                    {r.receiptNo} · {formatDate(r.paidAt)} · {METHOD_LABELS[r.method]}
                  </p>
                </div>
                <span className={r.status === "VOIDED" ? "tabular text-muted-foreground line-through" : "tabular font-semibold"}>{formatMoney(r.amount, currency)}</span>
              </div>
            )}
            empty={<EmptyState icon={Banknote} title="No payments match" description="Try a different search, method or date range." />}
          />
        </>
      )}
      {canRecord && <PaymentDrawer key={drawer.key} open={drawer.open} onOpenChange={(o) => setDrawer((d) => ({ ...d, open: o }))} currency={currency} today={today} />}
    </div>
  );
}
