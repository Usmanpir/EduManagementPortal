import { formatDate, formatMoney } from "@/lib/format";
import type { InvoiceDocument as Doc } from "@/server/modules/finance/invoices";
import { CATEGORY_LABELS, InvoiceStatusBadge, METHOD_LABELS } from "./finance-ui";

type Org = { name: string; address?: string | null; phone?: string | null; email?: string | null };

/** The invoice as the family sees it — used on screen and on paper. */
export function InvoiceDocumentView({ invoice: i, currency, organization, letterhead = false }: { invoice: Doc; currency: string; organization?: Org; letterhead?: boolean }) {
  const money = (v: number) => formatMoney(v, currency);
  const completed = i.payments.filter((p) => p.status === "COMPLETED");
  return (
    <article className="text-small">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          {letterhead && organization && (
            <div className="mb-4">
              <p className="text-h2">{organization.name}</p>
              <p className="text-caption text-muted-foreground">{[organization.address, organization.phone, organization.email].filter(Boolean).join(" · ")}</p>
            </div>
          )}
          <p className="text-caption tracking-wide text-muted-foreground uppercase">Billed to</p>
          <p className="text-body font-semibold">{i.student.name}</p>
          <p className="text-muted-foreground">
            {i.student.className ?? "Not placed"} · Adm. {i.student.admissionNo}
            {i.student.rollNumber ? ` · Roll ${i.student.rollNumber}` : ""}
          </p>
          {i.student.guardian && (
            <p className="text-muted-foreground">
              {i.student.guardian.name}
              {i.student.guardian.phone ? ` · ${i.student.guardian.phone}` : ""}
            </p>
          )}
        </div>
        <div className="text-end">
          <p className="text-h2">Invoice</p>
          <p className="tabular font-medium">{i.invoiceNo}</p>
          <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 gap-y-0.5 text-muted-foreground">
            <dt>Issued</dt>
            <dd className="tabular text-foreground">{formatDate(i.issueDate)}</dd>
            <dt>Due</dt>
            <dd className="tabular font-medium text-foreground">{formatDate(i.dueDate)}</dd>
          </dl>
          <div className="mt-2">
            <InvoiceStatusBadge status={i.status} />
          </div>
        </div>
      </header>

      <p className="mb-2 font-medium">{i.title}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b text-caption text-muted-foreground">
              <th className="py-2 text-start font-medium">Description</th>
              <th className="py-2 text-end font-medium">Amount</th>
              <th className="py-2 text-end font-medium">Discount</th>
              <th className="py-2 text-end font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {i.items.map((it) => (
              <tr key={it.id} className="border-b">
                <td className="py-2">
                  {it.description}
                  <span className="ms-2 text-caption text-muted-foreground">{CATEGORY_LABELS[it.category]}</span>
                </td>
                <td className="py-2 text-end tabular">{money(it.amount)}</td>
                <td className="py-2 text-end tabular text-muted-foreground">{it.discount ? `−${money(it.discount)}` : "—"}</td>
                <td className="py-2 text-end tabular">{money(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <dl className="grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="text-end tabular">{money(i.subtotal)}</dd>
          {i.discount > 0 && (
            <>
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="text-end tabular">−{money(i.discount)}</dd>
            </>
          )}
          {i.fine > 0 && (
            <>
              <dt className="text-muted-foreground">Late fee</dt>
              <dd className="text-end tabular">{money(i.fine)}</dd>
            </>
          )}
          <dt className="border-t pt-1 font-semibold">Total</dt>
          <dd className="border-t pt-1 text-end tabular font-semibold">{money(i.total)}</dd>
          <dt className="text-muted-foreground">Paid</dt>
          <dd className="text-end tabular">{money(i.paid)}</dd>
          <dt className="text-body font-semibold">Balance due</dt>
          <dd className="text-end tabular text-body font-semibold">{money(i.balance)}</dd>
        </dl>
      </div>

      {completed.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 text-caption tracking-wide text-muted-foreground uppercase">Payments received</h3>
          <ul className="divide-y rounded-lg border">
            {completed.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>
                  <span className="tabular">{p.receiptNo}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatDate(p.paidAt)} · {METHOD_LABELS[p.method]}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </span>
                </span>
                <span className="tabular font-medium">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {i.notes && <p className="mt-6 whitespace-pre-line text-muted-foreground">{i.notes}</p>}
    </article>
  );
}
