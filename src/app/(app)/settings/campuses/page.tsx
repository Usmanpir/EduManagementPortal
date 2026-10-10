import type { Metadata } from "next";
import { can, requirePageContext } from "@/server/auth/context";
import { listCampuses } from "@/server/modules/organizations/service";
import { getEffectiveLimits } from "@/server/modules/billing/limits";
import { CampusesView } from "./campuses-view";

export const metadata: Metadata = { title: "Campuses" };

export default async function CampusesPage() {
  const ctx = await requirePageContext("campuses.view");
  const [campuses, limits] = await Promise.all([listCampuses(ctx), getEffectiveLimits(ctx.orgId)]);
  return <CampusesView campuses={campuses} canManage={can(ctx, "campuses.manage")} limit={limits?.limits.campuses ?? null} planName={limits?.planName ?? null} />;
}
