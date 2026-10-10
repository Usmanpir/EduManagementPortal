import type { Metadata } from "next";
import { AlertTriangle, CalendarClock, Printer, ReceiptText, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { InvoiceStatusBadge, METHOD_LABELS } from "@/components/finance/finance-ui";
import { ChildSwitcher } from "@/components/portal/child-switcher";
import { NoStudent } from "@/components/portal/no-student";
import { myFees } from "@/server/modules/portal/service";
import { formatDate, formatMoney } from "@/lib/format";
import { portalPage } from "../portal-page";

export const metadata: Metadata = { title: "Fees" };

export default async function MyFeesPage({ searchParams }: PageProps<"/my/fees">) {
  const { ctx, students, student, isParent } = await portalPage(searchParams, "/finance");
  if (!student) return <NoStudent isParent={isParent} />;
  const fees = await myFees(ctx, student.id);
  const money = (v: number) => formatMoney(v, ctx.organization.currency);
  const open = fees.invoices.filter((i) => ["PENDING", "PARTIAL", "OVERDUE"].includes(i.status));
  const settled = fees.invoices.filter((i) => !["PENDING", "PARTIAL", "OVERDUE"].includes(i.status));

  const InvoiceItem = ({ i }: { i: (typeof fees.invoices)[number] }) => (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{i.title}</p>
          <p className="text-caption text-muted-foreground">
            {i.invoiceNo} · due {formatDate(i.dueDate)}
          </p>
        </div>
        <div className="text-end">
          <p className="tabular font-semibold">{money(i.balance > 0 ? i.balance : i.total)}</p>
          <InvoiceStatusBadge status={i.status} />
        </div>
        <Button variant="ghost" size="icon-sm" asChild>
          <a href={`/my/print/invoice/${i.id}`} target="_blank" rel="noreferrer" aria-label={`Print ${i.invoiceNo}`}>
            <Printer />
          </a>
        </Button>
      </div>
      {i.payments.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-s-2 ps-3">
          {i.payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-caption text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ReceiptText className="size-3.5" /> {money(p.amount)} paid {formatDate(p.paidAt)} · {METHOD_LABELS[p.method]?.split(" (")[0]}
              </span>
              <span className="tabular">{p.receiptNo}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader title="Fees" description={`${student.name}${student.className ? ` · ${student.className}` : ""}`} />
      <ChildSwitcher students={students} selectedId={student.id} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Amount due" value={money(fees.balance)} icon={Wallet} tone={fees.balance > 0 ? "warning" : "success"} hint={fees.balance > 0 ? `${open.length} unpaid invoice${open.length === 1 ? "" : "s"}` : "Nothing to pay"} />
        <StatCard label="Overdue" value={money(fees.overdue)} icon={AlertTriangle} tone={fees.overdue > 0 ? "danger" : "neutral"} />
        <StatCard label="Next due date" value={fees.nextDue ? formatDate(fees.nextDue) : "—"} icon={CalendarClock} tone="neutral" className="col-span-2 lg:col-span-1" />
      </div>
      {fees.balance > 0 && fees.paymentInstructions && (
        <div className="rounded-xl border border-dashed bg-card p-4 text-small">
          <p className="mb-1 font-medium">How to pay</p>
          <p className="whitespace-pre-line text-muted-foreground">{fees.paymentInstructions}</p>
        </div>
      )}
      {fees.invoices.length === 0 ? (
        <EmptyState icon={Wallet} title="No fee invoices" description="Invoices from the school will appear here." />
      ) : (
        <>
          {open.length > 0 && (
            <section>
              <SectionHeader title="To pay" />
              <ul className="divide-y rounded-xl border bg-card shadow-xs">
                {open.map((i) => (
                  <InvoiceItem key={i.id} i={i} />
                ))}
              </ul>
            </section>
          )}
          {settled.length > 0 && (
            <section>
              <SectionHeader title="Paid" />
              <ul className="divide-y rounded-xl border bg-card shadow-xs">
                {settled.map((i) => (
                  <InvoiceItem key={i.id} i={i} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
