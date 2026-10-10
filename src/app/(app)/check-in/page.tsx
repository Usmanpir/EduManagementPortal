import type { Metadata } from "next";
import { QrCode } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { requirePageContext } from "@/server/auth/context";
import { CheckInPanel } from "./check-in-panel";

export const metadata: Metadata = { title: "Check in" };

/** Landing page opened by scanning the campus QR code. */
export default async function CheckInPage({ searchParams }: PageProps<"/check-in">) {
  const ctx = await requirePageContext();
  const { c, t } = await searchParams;
  if (typeof c !== "string" || typeof t !== "string" || !/^[0-9a-f-]{36}$/i.test(c)) {
    return <EmptyState icon={QrCode} title="Scan the check-in code" description="Use your phone camera to scan the QR code displayed at reception." />;
  }
  const campus = await ctx.db.campus.findFirst({ where: { id: c, deletedAt: null }, select: { name: true } });
  return <CheckInPanel campusId={c} token={t} campusName={campus?.name ?? "your campus"} firstName={ctx.user.firstName} isStaff={!!ctx.staffId} />;
}
