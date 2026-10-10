import type { Metadata } from "next";
import { can, requirePageContext } from "@/server/auth/context";
import { billingOverview } from "@/server/modules/billing/account";
import { BillingView } from "./billing-view";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const ctx = await requirePageContext("billing.view");
  const data = await billingOverview(ctx);
  return <BillingView data={data} canManage={can(ctx, "billing.manage")} />;
}
