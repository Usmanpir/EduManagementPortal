"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Ellipsis, Plus, Printer, ReceiptText, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field } from "@/components/common/field";
import { SectionHeader } from "@/components/common/page-header";
import { METHOD_LABELS } from "@/components/finance/finance-ui";
import { PaymentDrawer } from "@/components/finance/payment-drawer";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import type { InvoiceDocument } from "@/server/modules/finance/invoices";

export function InvoiceActions({ invoice, currency, today, perms }: { invoice: InvoiceDocument; currency: string; today: string; perms: { record: boolean; manage: boolean } }) {
  const router = useRouter();
  const [pay, setPay] = useState({ open: false, key: 0 });
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const open = invoice.status !== "CANCELLED" && invoice.balance > 0;
  const hasPayments = invoice.payments.some((p) => p.status === "COMPLETED");

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/finance/invoices">
          <ArrowLeft className="rtl:rotate-180" /> Invoices
        </Link>
      </Button>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" asChild>
          <Link href={`/students/${invoice.student.id}?tab=fees`}>Student</Link>
        </Button>
        <Button variant="outline" asChild>
          <a href={`/finance/print/invoices?ids=${invoice.id}`} target="_blank" rel="noreferrer">
            <Printer /> Print
          </a>
        </Button>
        {perms.record && open && (
          <Button onClick={() => setPay((p) => ({ open: true, key: p.key + 1 }))}>
            <Plus /> Record payment
          </Button>
        )}
        {perms.manage && invoice.status !== "CANCELLED" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" disabled={hasPayments} onSelect={() => setCancelling(true)}>
                <Ban /> Cancel invoice
              </DropdownMenuItem>
              {hasPayments && <p className="max-w-56 px-2 py-1.5 text-caption text-muted-foreground">Void its payments first to cancel this invoice.</p>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {perms.record && open && (
        <PaymentDrawer
          key={pay.key}
          open={pay.open}
          onOpenChange={(o) => setPay((p) => ({ ...p, open: o }))}
          currency={currency}
          today={today}
          invoice={{ id: invoice.id, invoiceNo: invoice.invoiceNo, title: invoice.title, dueDate: invoice.dueDate, total: invoice.total, balance: invoice.balance, status: invoice.status, student: invoice.student.name }}
        />
      )}
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        tone="danger"
        title={`Cancel ${invoice.invoiceNo}?`}
        description="The family will no longer owe this amount. The invoice stays in your records as cancelled."
        confirmLabel="Cancel invoice"
        cancelLabel="Keep"
        onConfirm={async () => {
          try {
            const { message } = await api.delete(`/api/invoices/${invoice.id}`, { reason });
            toast.success(message);
            setCancelling(false);
            router.refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      >
        <Field label="Reason" htmlFor="cancel-reason" required>
          <Textarea id="cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Student withdrew before the month started" />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

export function PaymentHistory({ payments, currency, canVoid }: { payments: InvoiceDocument["payments"]; currency: string; canVoid: boolean }) {
  const router = useRouter();
  const [voiding, setVoiding] = useState<InvoiceDocument["payments"][number] | null>(null);
  const [reason, setReason] = useState("");

  return (
    <section className="rounded-xl border bg-card shadow-xs">
      <SectionHeader title="Payment history" className="px-5 pt-5" />
      <ul className="divide-y">
        {payments.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <ReceiptText className="size-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                <span className="tabular">{p.receiptNo}</span>
                {p.status === "VOIDED" && (
                  <Badge variant="neutral" className="ms-2">
                    Voided
                  </Badge>
                )}
              </p>
              <p className="text-caption text-muted-foreground">
                {formatDate(p.paidAt)} · {METHOD_LABELS[p.method]}
                {p.reference ? ` · ${p.reference}` : ""}
                {p.receivedBy ? ` · received by ${p.receivedBy}` : ""}
                {p.voidReason ? ` · voided: ${p.voidReason}` : ""}
              </p>
            </div>
            <span className={p.status === "VOIDED" ? "tabular text-muted-foreground line-through" : "tabular font-semibold"}>{formatMoney(p.amount, currency)}</span>
            {p.status === "COMPLETED" && (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" asChild>
                  <a href={`/finance/print/receipt/${p.id}`} target="_blank" rel="noreferrer">
                    <Printer /> Receipt
                  </a>
                </Button>
                {canVoid && (
                  <Button variant="ghost" size="sm" onClick={() => setVoiding(p)}>
                    <Undo2 /> Void
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!voiding}
        onOpenChange={(o) => !o && setVoiding(null)}
        tone="danger"
        title={`Void receipt ${voiding?.receiptNo}?`}
        description="Use this for a bounced cheque or a payment entered by mistake. The amount goes back onto the invoice balance."
        confirmLabel="Void payment"
        onConfirm={async () => {
          try {
            const { message } = await api.delete(`/api/payments/${voiding!.id}`, { reason });
            toast.success(message);
            setVoiding(null);
            setReason("");
            router.refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      >
        <Field label="Reason" htmlFor="void-reason" required>
          <Textarea id="void-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cheque returned by bank" />
        </Field>
      </ConfirmDialog>
    </section>
  );
}
