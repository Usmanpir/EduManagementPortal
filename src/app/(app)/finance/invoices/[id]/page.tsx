import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { InvoiceDocumentView } from "@/components/finance/invoice-document";
import { can, requirePageContext } from "@/server/auth/context";
import { getInvoice } from "@/server/modules/finance/invoices";
import { todayIn } from "@/lib/format";
import { InvoiceActions, PaymentHistory } from "./invoice-client";

export const metadata: Metadata = { title: "Invoice" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function InvoicePage({ params }: PageProps<"/finance/invoices/[id]">) {
  const ctx = await requirePageContext();
  if (!can(ctx, "invoices.view")) redirect("/forbidden");
  const { id } = await params;
  const invoice = UUID.test(id) ? await getInvoice(ctx, id) : null;
  if (!invoice) notFound();
  const currency = ctx.organization.currency;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <BreadcrumbLabel segment={id} label={invoice.invoiceNo} />
      <InvoiceActions
        invoice={invoice}
        currency={currency}
        today={todayIn(ctx.organization.timezone)}
        perms={{ record: can(ctx, "payments.record"), manage: can(ctx, "invoices.manage") }}
      />
      <div className="rounded-xl border bg-card p-5 shadow-xs sm:p-8">
        <InvoiceDocumentView invoice={invoice} currency={currency} />
      </div>
      {invoice.payments.length > 0 && <PaymentHistory payments={invoice.payments} currency={currency} canVoid={can(ctx, "payments.void")} />}
    </div>
  );
}
