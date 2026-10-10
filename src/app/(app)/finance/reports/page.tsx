import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can, requirePageContext } from "@/server/auth/context";
import { financeLookups } from "@/server/modules/finance/fees";
import { financeReport } from "@/server/modules/finance/report";
import { todayIn } from "@/lib/format";
import { FinanceReportView } from "./finance-report-view";

export const metadata: Metadata = { title: "Finance reports" };

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function FinanceReportsPage({ searchParams }: PageProps<"/finance/reports">) {
  const ctx = await requirePageContext();
  if (!can(ctx, "invoices.view")) redirect("/forbidden");
  const sp = await searchParams;
  const today = todayIn(ctx.organization.timezone);
  // Default: the current academic-ish window — this calendar year to date.
  let to = isDate(sp.to) && sp.to <= today ? sp.to : today;
  let from = isDate(sp.from) ? sp.from : `${today.slice(0, 4)}-01-01`;
  if (from > to) [from, to] = [to, from];
  const classId = typeof sp.classId === "string" && /^[0-9a-f-]{36}$/i.test(sp.classId) ? sp.classId : null;
  const [report, lookups] = await Promise.all([financeReport(ctx, { from, to, classId }), financeLookups(ctx)]);
  return <FinanceReportView report={report} classes={lookups.classes} today={today} currency={ctx.organization.currency} canExport={can(ctx, "reports.export")} />;
}
