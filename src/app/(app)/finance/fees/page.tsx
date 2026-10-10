import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can, requirePageContext } from "@/server/auth/context";
import { financeLookups, listFeeStructures } from "@/server/modules/finance/fees";
import { FeesView } from "./fees-view";

export const metadata: Metadata = { title: "Fees" };

export default async function FeesPage() {
  const ctx = await requirePageContext();
  if (!can(ctx, "fees.view")) redirect("/forbidden");
  const [fees, lookups] = await Promise.all([listFeeStructures(ctx), financeLookups(ctx)]);
  return <FeesView fees={fees} lookups={lookups} currency={ctx.organization.currency} canManage={can(ctx, "fees.manage")} />;
}
