import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { LogoMark } from "@/components/brand/logo";
import { requirePageContext } from "@/server/auth/context";
import { AppError } from "@/server/http/errors";
import { myBillingInvoice } from "@/server/modules/billing/account";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "EduAttend invoice" };

/** EduAttend's invoice to the school (the platform's letterhead, not the school's). */
export default async function BillingInvoicePrint({ params }: PageProps<"/settings/billing/invoice/[id]">) {
  const ctx = await requirePageContext("billing.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await myBillingInvoice(ctx, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!data) notFound();
  const { invoice: i, org, instructions } = data;
  const amount = formatMoney(Number(i.amount), i.currency);

  return (
    <article className="text-small">
      <header className="mb-8 flex items-start justify-between gap-6 border-b pb-5">
        <div className="flex items-center gap-3">
          <LogoMark className="size-10" />
          <div>
            <p className="text-h2">EduAttend</p>
            <p className="text-caption text-muted-foreground">School management software</p>
          </div>
        </div>
        <div className="text-end">
          <p className="text-h1">Invoice</p>
          <p className="tabular font-medium">{i.number}</p>
          <Badge variant={i.status === "PAID" ? "success" : i.status === "VOID" ? "neutral" : "warning"} className="mt-1">
            {i.status === "PAID" ? "Paid" : i.status === "VOID" ? "Void" : "Due"}
          </Badge>
        </div>
      </header>
      <div className="mb-8 grid grid-cols-2 gap-6">
        <div>
          <p className="text-caption tracking-wide text-muted-foreground uppercase">Billed to</p>
          <p className="font-semibold">{org.name}</p>
          <p className="text-muted-foreground">{[org.address, org.phone, org.email].filter(Boolean).join(" · ")}</p>
        </div>
        <dl className="grid grid-cols-[auto_auto] justify-end gap-x-4 gap-y-0.5 text-muted-foreground">
          <dt>Issued</dt>
          <dd className="text-foreground">{formatDate(i.issuedAt, "long")}</dd>
          <dt>Due</dt>
          <dd className="font-medium text-foreground">{formatDate(i.dueAt, "long")}</dd>
          {i.paidAt && (
            <>
              <dt>Paid</dt>
              <dd className="text-foreground">{formatDate(i.paidAt, "long")}</dd>
            </>
          )}
        </dl>
      </div>
      <table className="mb-6 w-full border-collapse">
        <thead>
          <tr className="border-b text-caption text-muted-foreground">
            <th className="py-2 text-start font-medium">Description</th>
            <th className="py-2 text-end font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-3">
              EduAttend {i.subscription.plan.name} plan
              <span className="block text-caption text-muted-foreground">
                {formatDate(i.periodStart, "long")} – {formatDate(i.periodEnd, "long")}
              </span>
            </td>
            <td className="py-3 text-end tabular">{amount}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td className="py-3 text-end font-semibold">Total</td>
            <td className="py-3 text-end tabular text-h3">{amount}</td>
          </tr>
        </tfoot>
      </table>
      {i.status === "OPEN" && instructions && (
        <p className="rounded-lg border border-dashed p-3 text-muted-foreground">
          <span className="font-medium text-foreground">How to pay: </span>
          {instructions} Please quote <span className="font-medium text-foreground">{i.number}</span> as the reference.
        </p>
      )}
      {i.paymentNote && <p className="mt-4 text-caption text-muted-foreground">Payment: {i.paymentNote}</p>}
    </article>
  );
}
