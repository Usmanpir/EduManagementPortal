import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can, requirePageContext } from "@/server/auth/context";
import { listPayments } from "@/server/modules/finance/payments";
import { pagination } from "@/lib/validation/common";
import { csvList } from "@/lib/validation/query";
import { todayIn } from "@/lib/format";
import { PaymentsView } from "./payments-view";

export const metadata: Metadata = { title: "Payments" };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined);
const params = pagination.extend({ method: csvList, from: date, to: date });

export default async function PaymentsPage({ searchParams }: PageProps<"/finance/payments">) {
  const ctx = await requirePageContext();
  if (!can(ctx, "payments.view")) redirect("/forbidden");
  const query = params.parse(await searchParams);
  const list = await listPayments(ctx, query);
  return (
    <PaymentsView
      {...list}
      page={query.page}
      pageSize={query.pageSize}
      hasFilters={!!(query.q || query.method?.length || query.from || query.to)}
      currency={ctx.organization.currency}
      today={todayIn(ctx.organization.timezone)}
      canRecord={can(ctx, "payments.record")}
    />
  );
}
