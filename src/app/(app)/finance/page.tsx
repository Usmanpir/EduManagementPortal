import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Banknote, CalendarClock, ChevronRight, FileText, Receipt, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ChartCard } from "@/components/charts/charts";
import { METHOD_LABELS } from "@/components/finance/finance-ui";
import { can, canAny, requirePageContext } from "@/server/auth/context";
import { financeOverview } from "@/server/modules/finance/overview";
import { formatDate, formatMoney, formatNumber, todayIn } from "@/lib/format";
import { CollectionsChart, FinanceActions } from "./overview-client";

export const metadata: Metadata = { title: "Finance" };

export default async function FinancePage() {
  const ctx = await requirePageContext();
  if (!canAny(ctx, "invoices.view", "payments.view")) redirect("/forbidden");
  const currency = ctx.organization.currency;
  const today = todayIn(ctx.organization.timezone);
  const o = await financeOverview(ctx);
  const money = (v: number) => formatMoney(v, currency);
  const monthTotal = o.methods.reduce((n, m) => n + m.amount, 0);
  const empty = o.openInvoices === 0 && o.month === 0 && o.recent.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Finance"
        description={`Fee collection for ${formatDate(today, "long")}.`}
        actions={<FinanceActions currency={currency} today={today} canRecord={can(ctx, "payments.record")} canInvoice={can(ctx, "invoices.manage")} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Collected today" value={money(o.today.amount)} hint={`${formatNumber(o.today.count)} payment${o.today.count === 1 ? "" : "s"}`} icon={Banknote} tone="success" href="/finance/payments" />
        <StatCard label="Collected this month" value={money(o.month)} icon={Wallet} tone="primary" />
        <StatCard label="Outstanding" value={money(o.outstanding)} hint={`${formatNumber(o.openInvoices)} unpaid invoices`} icon={FileText} tone="warning" href="/finance/invoices?status=PENDING%2CPARTIAL%2COVERDUE" />
        <StatCard label="Overdue" value={money(o.overdue)} hint={`${formatNumber(o.overdueCount)} invoices`} icon={AlertTriangle} tone="danger" href="/finance/invoices?status=OVERDUE" />
      </div>

      {empty ? (
        <EmptyState
          icon={Receipt}
          title="No billing yet"
          description="Set up your fee structures, then generate this month's invoices. Payments you record will show up here."
          actions={
            can(ctx, "fees.view") && (
              <Button asChild>
                <Link href="/finance/fees">Set up fees</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChartCard title="Daily collections" description="Completed payments over the last 30 days" className="lg:col-span-2">
              <CollectionsChart data={o.trend} currency={currency} />
            </ChartCard>
            <ChartCard title="How families paid" description="This month, by method">
              {o.methods.length === 0 ? (
                <p className="py-8 text-center text-small text-muted-foreground">No payments this month yet.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {o.methods.map((m) => {
                    const share = monthTotal ? (m.amount / monthTotal) * 100 : 0;
                    return (
                      <li key={m.method}>
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-small">
                          <span className="truncate">{METHOD_LABELS[m.method] ?? m.method}</span>
                          <span className="tabular font-medium">{money(m.amount)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(share)} aria-valuemin={0} aria-valuemax={100} aria-label={`${METHOD_LABELS[m.method]} share`}>
                          <div className="h-full rounded-full bg-chart-1" style={{ width: `${share}%` }} />
                        </div>
                        <p className="mt-0.5 text-caption text-muted-foreground">
                          {Math.round(share)}% · {formatNumber(m.count)} payments
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-xl border bg-card shadow-xs">
              <SectionHeader title="Recent payments" className="px-5 pt-5" actions={<Link href="/finance/payments" className="text-small font-medium text-primary hover:underline">View all</Link>} />
              {o.recent.length === 0 ? (
                <p className="px-5 pb-5 text-small text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <ul className="divide-y">
                  {o.recent.map((p) => (
                    <li key={p.id}>
                      <Link href={`/finance/invoices/${p.invoiceId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{p.student}</p>
                          <p className="text-caption text-muted-foreground">
                            {p.receiptNo} · {METHOD_LABELS[p.method]} · {formatDate(p.paidAt)}
                          </p>
                        </div>
                        <span className="tabular font-semibold text-success-foreground">{money(p.amount)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-xl border bg-card shadow-xs">
              <SectionHeader title="Most overdue" className="px-5 pt-5" actions={o.overdueCount > 0 && <Link href="/finance/invoices?status=OVERDUE&sort=due&dir=asc" className="text-small font-medium text-primary hover:underline">View all {formatNumber(o.overdueCount)}</Link>} />
              {o.overdueInvoices.length === 0 ? (
                <p className="flex items-center gap-2 px-5 pb-5 text-small text-muted-foreground">
                  <CalendarClock className="size-4" /> Nothing overdue. Nice.
                </p>
              ) : (
                <ul className="divide-y">
                  {o.overdueInvoices.map((i) => (
                    <li key={i.id}>
                      <Link href={`/finance/invoices/${i.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{i.student}</p>
                          <p className="text-caption text-muted-foreground">
                            {i.className ?? "—"} · {i.invoiceNo} · due {formatDate(i.dueDate)}
                          </p>
                        </div>
                        <span className="tabular font-semibold text-danger-foreground">{money(i.balance)}</span>
                        <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
