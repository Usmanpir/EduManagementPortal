import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/print-header";
import { ReportSummary, ReportTable } from "@/components/reports/report-table";
import { requirePageContext } from "@/server/auth/context";
import { auditFor } from "@/server/audit";
import { AppError } from "@/server/http/errors";
import { runReport } from "@/server/modules/reports/registry";
import { formatDate, formatDateTime } from "@/lib/format";
import { reportMeta, reportParamsSchema } from "@/lib/reports";

export const metadata: Metadata = { title: "Report" };

export default async function PrintReport({ params, searchParams }: PageProps<"/reports/print/[key]">) {
  const ctx = await requirePageContext("reports.view");
  const { key } = await params;
  if (!reportMeta(key)) notFound();
  const outcome = await runReport(ctx, key, reportParamsSchema.parse(await searchParams)).catch((e) => {
    if (e instanceof AppError && ["NOT_FOUND", "BAD_REQUEST", "FORBIDDEN"].includes(e.code)) return null;
    throw e;
  });
  if (!outcome) notFound();
  const { meta, params: p, result } = outcome;
  const org = await ctx.db.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { name: true, address: true, phone: true, email: true } });
  await auditFor(ctx)({ action: "report.export", entityType: "report", metadata: { report: meta.key, format: "print", ...p } });
  const period = meta.filters.includes("dateRange") ? `${formatDate(p.from, "long")} – ${formatDate(p.to, "long")}` : meta.filters.includes("month") ? new Date(`${p.month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : undefined;

  return (
    <article className="text-small">
      {/* Wide reports (e.g. the monthly register) print on landscape pages. */}
      {result.columns.length > 12 && <style>{"@page { size: A4 landscape; margin: 10mm; }"}</style>}
      <PrintHeader organization={org} title={meta.title} subtitle={period} meta={<p className="text-caption text-muted-foreground">Generated {formatDateTime(new Date().toISOString(), ctx.organization.timezone)}</p>} />
      {result.note && <p className="mb-3 text-caption text-muted-foreground">{result.note}</p>}
      {result.summary && (
        <div className="mb-5">
          <ReportSummary summary={result.summary} currency={ctx.organization.currency} />
        </div>
      )}
      <ReportTable result={result} currency={ctx.organization.currency} dense />
    </article>
  );
}
