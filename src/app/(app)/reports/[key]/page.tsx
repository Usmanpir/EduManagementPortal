import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FileSearch } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { FormAlert } from "@/components/common/form-alert";
import { PageHeader } from "@/components/common/page-header";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { ReportSummary, ReportTable } from "@/components/reports/report-table";
import { can, requirePageContext } from "@/server/auth/context";
import { AppError } from "@/server/http/errors";
import { normalizeParams, reportFilterOptions, runReport } from "@/server/modules/reports/registry";
import { reportMeta, reportParamsSchema } from "@/lib/reports";
import { ReportFilters } from "./report-filters";

export const metadata: Metadata = { title: "Report" };

const PREVIEW = 500;

export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[key]">) {
  const ctx = await requirePageContext();
  const { key } = await params;
  const meta = reportMeta(key);
  if (!meta) notFound();
  if (!can(ctx, "reports.view", ...meta.permissions)) redirect("/forbidden");
  const raw = reportParamsSchema.parse(await searchParams);
  const { params: used, missing, today } = normalizeParams(ctx, meta, raw);
  const [options, outcome] = await Promise.all([
    reportFilterOptions(ctx),
    missing.length
      ? null
      : runReport(ctx, key, raw).catch((e) => {
          if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "BAD_REQUEST")) return { error: e.message } as const;
          throw e;
        }),
  ]);
  const result = outcome && "result" in outcome ? outcome.result : null;
  const query = new URLSearchParams(Object.entries(used).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));

  return (
    <div className="flex flex-col gap-5">
      <BreadcrumbLabel segment={key} label={meta.title} />
      <PageHeader title={meta.title} description={meta.description} />
      <ReportFilters
        meta={meta}
        values={used}
        today={today}
        options={options}
        exportQuery={result ? query.toString() : null}
        canExport={can(ctx, "reports.export")}
      />
      {missing.length > 0 ? (
        <EmptyState icon={FileSearch} title={`Choose ${missing[0] === "exam" ? "an exam" : `a ${missing[0]}`}`} description="Pick it from the filters above and the report will appear here." />
      ) : outcome && "error" in outcome ? (
        <FormAlert>{outcome.error}</FormAlert>
      ) : result ? (
        <>
          {result.note && <FormAlert variant="info">{result.note}</FormAlert>}
          {result.summary && <ReportSummary summary={result.summary} currency={ctx.organization.currency} />}
          {result.rows.length === 0 ? (
            <EmptyState icon={FileSearch} title="Nothing to show" description="No records match these filters. Try a wider date range or a different class." />
          ) : (
            <>
              <p className="text-small text-muted-foreground">
                {result.rows.length > PREVIEW ? `Showing the first ${PREVIEW} of ${result.rows.length.toLocaleString()} rows. Export to get them all.` : `${result.rows.length.toLocaleString()} row${result.rows.length === 1 ? "" : "s"}`}
              </p>
              <ReportTable result={result} currency={ctx.organization.currency} limit={PREVIEW} />
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
