import type { Metadata } from "next";
import { canAny, can, requirePageContext } from "@/server/auth/context";
import { listCorrections } from "@/server/modules/attendance/register";
import { redirect } from "next/navigation";
import { CorrectionsView } from "./corrections-view";

export const metadata: Metadata = { title: "Attendance corrections" };

export default async function CorrectionsPage({ searchParams }: PageProps<"/attendance/corrections">) {
  const ctx = await requirePageContext();
  if (!canAny(ctx, "attendance.edit", "attendance.mark")) redirect("/forbidden");
  const { status: raw } = await searchParams;
  const status = raw === "APPROVED" || raw === "REJECTED" ? raw : "PENDING";
  const rows = await listCorrections(ctx, status);
  return <CorrectionsView rows={rows} status={status} canReview={can(ctx, "attendance.edit")} />;
}
