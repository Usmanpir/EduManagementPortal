import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvoiceDocumentView } from "@/components/finance/invoice-document";
import { requirePageContext } from "@/server/auth/context";
import { AppError } from "@/server/http/errors";
import { myInvoiceDocument } from "@/server/modules/portal/service";

export const metadata: Metadata = { title: "Invoice" };

/** Families can print their own child's invoices (with payments received). */
export default async function MyInvoicePrint({ params }: PageProps<"/my/print/invoice/[id]">) {
  const ctx = await requirePageContext();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const doc = await myInvoiceDocument(ctx, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!doc) notFound();
  const org = await ctx.db.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { name: true, address: true, phone: true, email: true } });
  return (
    <>
      <InvoiceDocumentView invoice={doc} currency={ctx.organization.currency} organization={org} letterhead />
      {ctx.settings.finance.invoiceFooter && doc.balance > 0 && <p className="mt-6 rounded-lg border border-dashed p-3 text-small whitespace-pre-line text-muted-foreground">{ctx.settings.finance.invoiceFooter}</p>}
    </>
  );
}
