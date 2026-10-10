"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { StudentPicker } from "@/components/people/student-picker";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/validation/finance";
import { InvoiceStatusBadge, METHOD_LABELS } from "./finance-ui";
import { DatePicker } from "@/components/common/date-pickers";

type OpenInvoice = { id: string; invoiceNo: string; title: string; dueDate: string; total: number; balance: number; status: string };

/**
 * Record a payment against an invoice. Opened from an invoice (fixed) or
 * standalone (pick a student, then one of their unpaid invoices).
 */
export function PaymentDrawer({
  open,
  onOpenChange,
  currency,
  today,
  invoice,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currency: string;
  today: string;
  invoice?: OpenInvoice & { student: string };
  onRecorded?: (receipt: { id: string; receiptNo: string }) => void;
}) {
  const router = useRouter();
  const [studentId, setStudentId] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<OpenInvoice[] | null>(invoice ? [invoice] : null);
  const [invoiceId, setInvoiceId] = useState<string | null>(invoice?.id ?? null);
  const selected = useMemo(() => invoices?.find((i) => i.id === invoiceId) ?? null, [invoices, invoiceId]);
  const [amount, setAmount] = useState(invoice ? String(invoice.balance) : "");
  const [method, setMethod] = useState<string>("CASH");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(today);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One key per drawer session: retries/double-clicks can't record the payment twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (invoice || !studentId) return;
    let active = true;
    api
      .get<OpenInvoice[]>(`/api/payments/open?studentId=${studentId}`)
      .then(({ data }) => {
        if (!active) return;
        setInvoices(data);
        const first = data[0];
        setInvoiceId(first?.id ?? null);
        setAmount(first ? String(first.balance) : "");
      })
      .catch((e) => active && setFormError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [studentId, invoice]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    if (!invoiceId) return setFormError("Choose an invoice to pay.");
    setSaving(true);
    try {
      const { data, message } = await api.post<{ id: string; receiptNo: string; duplicate: boolean }>("/api/payments", {
        invoiceId,
        amount,
        method,
        reference,
        paidAt,
        notes,
        idempotencyKey,
      });
      toast.success(message, { action: { label: "Print receipt", onClick: () => window.open(`/finance/print/receipt/${data.id}`, "_blank") } });
      onOpenChange(false);
      onRecorded?.(data);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Record payment" description={invoice ? `${invoice.student} · ${invoice.invoiceNo}` : "Fee received at the counter, by bank or wallet."} formId="payment-form" submitLabel="Record payment" submitting={saving}>
      <form id="payment-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormAlert>{formError}</FormAlert>
        {!invoice && (
          <Field label="Student" htmlFor="studentId" required>
            <StudentPicker value={studentId} onChange={setStudentId} />
          </Field>
        )}
        {!invoice && studentId && (
          <Field label="Invoice" htmlFor="invoice-list" required>
            {invoices === null ? (
              <Skeleton className="h-16" />
            ) : invoices.length === 0 ? (
              <FormAlert variant="success">This student has no unpaid invoices.</FormAlert>
            ) : (
              <ul id="invoice-list" role="radiogroup" aria-label="Unpaid invoices" className="flex flex-col gap-1.5">
                {invoices.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={invoiceId === i.id}
                      onClick={() => {
                        setInvoiceId(i.id);
                        setAmount(String(i.balance));
                      }}
                      className={cn("flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-start", invoiceId === i.id ? "border-primary bg-primary-subtle/50" : "bg-card hover:bg-muted/40")}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-small font-medium">{i.title}</span>
                        <span className="block text-caption text-muted-foreground">
                          {i.invoiceNo} · due {formatDate(i.dueDate)}
                        </span>
                      </span>
                      <span className="text-end">
                        <span className="block tabular text-small font-semibold">{formatMoney(i.balance, currency)}</span>
                        <InvoiceStatusBadge status={i.status} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        )}
        {selected && (
          <>
            <FieldRow>
              <Field label={`Amount (${currency})`} htmlFor="amount" error={errors.amount} hint={`Balance ${formatMoney(selected.balance, currency)}`} required>
                <Input type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular" />
              </Field>
              <Field label="Date received" htmlFor="paidAt" error={errors.paidAt} required>
                <DatePicker max={today} value={paidAt} onChange={(v) => setPaidAt(v)} />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Method" htmlFor="method">
                <OptionSelect id="method" value={method} onChange={(v) => setMethod(v ?? "CASH")} options={PAYMENT_METHODS.map((m) => ({ value: m, label: METHOD_LABELS[m]! }))} />
              </Field>
              <Field label="Reference" htmlFor="reference" error={errors.reference} hint={method === "CASH" ? "Optional" : "Transaction or cheque number"}>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </FieldRow>
            <Field label="Notes" htmlFor="notes">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </>
        )}
      </form>
    </FormDrawer>
  );
}
