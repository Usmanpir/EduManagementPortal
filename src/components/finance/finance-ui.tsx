import { Badge } from "@/components/ui/badge";

export const INVOICE_STATUS: Record<string, { label: string; variant: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  PAID: { label: "Paid", variant: "success" },
  PARTIAL: { label: "Partial", variant: "info" },
  PENDING: { label: "Pending", variant: "warning" },
  OVERDUE: { label: "Overdue", variant: "danger" },
  CANCELLED: { label: "Cancelled", variant: "neutral" },
  DRAFT: { label: "Draft", variant: "neutral" },
};

export function InvoiceStatusBadge({ status }: { status: string }) {
  const s = INVOICE_STATUS[status] ?? INVOICE_STATUS.PENDING!;
  return (
    <Badge variant={s.variant} dot>
      {s.label}
    </Badge>
  );
}

export const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  CHEQUE: "Cheque",
  ONLINE: "Online",
  MOBILE_WALLET: "Mobile wallet (JazzCash / Easypaisa)",
  OTHER: "Other",
};

export const CATEGORY_LABELS: Record<string, string> = {
  TUITION: "Tuition",
  ADMISSION: "Admission",
  EXAM: "Exam",
  TRANSPORT: "Transport",
  HOSTEL: "Hostel",
  LIBRARY: "Library",
  LAB: "Lab",
  FINE: "Fine",
  OTHER: "Other",
};

export const FREQUENCY_LABELS: Record<string, string> = { MONTHLY: "Monthly", QUARTERLY: "Quarterly", ANNUAL: "Yearly", ONE_TIME: "One-time" };
