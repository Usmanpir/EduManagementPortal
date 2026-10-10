/** Money helpers working in integer paisa/cents so sums never drift. */
export const toCents = (v: number | string | { toString(): string } | null | undefined) => Math.round(Number(v ?? 0) * 100);
export const fromCents = (c: number) => c / 100;

export type InvoiceStatusValue = "DRAFT" | "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";

/** Status of an invoice from its totals and due date (cancelled invoices stay cancelled). */
export function invoiceStatus(totalCents: number, paidCents: number, dueDate: string, today: string, current?: InvoiceStatusValue): InvoiceStatusValue {
  if (current === "CANCELLED" || current === "DRAFT") return current;
  if (paidCents >= totalCents) return "PAID";
  if (dueDate < today) return "OVERDUE";
  return paidCents > 0 ? "PARTIAL" : "PENDING";
}

export function discountCents(amountCents: number, type: string, value: number) {
  if (type === "PERCENT") return Math.min(amountCents, Math.round((amountCents * Math.min(100, value)) / 100));
  if (type === "FIXED") return Math.min(amountCents, toCents(value));
  return 0;
}
