import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can, requirePageContext } from "@/server/auth/context";
import { financeLookups, listFeeStructures } from "@/server/modules/finance/fees";
import { listInvoices } from "@/server/modules/finance/invoices";
import { pagination } from "@/lib/validation/common";
import { csvList } from "@/lib/validation/query";
import { todayIn } from "@/lib/format";
import { InvoicesView } from "./invoices-view";

export const metadata: Metadata = { title: "Invoices" };

const params = pagination.extend({ status: csvList, classId: csvList, period: z.string().regex(/^\d{4}-\d{2}$/).optional().catch(undefined) });

export default async function InvoicesPage({ searchParams }: PageProps<"/finance/invoices">) {
  const ctx = await requirePageContext();
  if (!can(ctx, "invoices.view")) redirect("/forbidden");
  const query = params.parse(await searchParams);
  const canManage = can(ctx, "invoices.manage");
  const [list, lookups, fees] = await Promise.all([listInvoices(ctx, query), financeLookups(ctx), canManage && can(ctx, "fees.view") ? listFeeStructures(ctx) : Promise.resolve([])]);
  return (
    <InvoicesView
      {...list}
      page={query.page}
      pageSize={query.pageSize}
      hasFilters={!!(query.q || query.status?.length || query.classId?.length || query.period)}
      classes={lookups.classes}
      fees={fees}
      currency={ctx.organization.currency}
      today={todayIn(ctx.organization.timezone)}
      perms={{ manage: canManage, record: can(ctx, "payments.record") }}
    />
  );
}
