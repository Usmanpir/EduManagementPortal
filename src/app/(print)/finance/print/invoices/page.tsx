import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvoiceDocumentView } from "@/components/finance/invoice-document";
import { requirePageContext } from "@/server/auth/context";
import { invoiceDocuments } from "@/server/modules/finance/invoices";

export const metadata: Metadata = { title: "Invoices" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function PrintInvoices({ searchParams }: PageProps<"/finance/print/invoices">) {
  const ctx = await requirePageContext("invoices.view");
  const raw = (await searchParams).ids;
  const ids = (typeof raw === "string" ? raw.split(",") : []).filter((id) => UUID.test(id)).slice(0, 200);
  if (!ids.length) notFound();
  const [invoices, org] = await Promise.all([
    invoiceDocuments(ctx, ids),
    ctx.db.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { name: true, address: true, phone: true, email: true } }),
  ]);
  if (!invoices.length) notFound();
  const instructions = ctx.settings.finance.invoiceFooter;

  return (
    <div className="flex flex-col">
      {invoices.map((inv, i) => (
        <section key={inv.id} className={i ? "mt-10 border-t pt-10 print:mt-0 print:break-before-page print:border-0 print:pt-0" : undefined}>
          <InvoiceDocumentView invoice={inv} currency={ctx.organization.currency} organization={org} letterhead />
          {instructions && inv.balance > 0 && (
            <p className="mt-6 rounded-lg border border-dashed p-3 text-small whitespace-pre-line text-muted-foreground">
              {instructions}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
