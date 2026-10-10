import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can, requirePageContext } from "@/server/auth/context";
import { leaveSubjects, listLeave } from "@/server/modules/attendance/leave";
import { LeaveView } from "../../attendance/leave/leave-view";

export const metadata: Metadata = { title: "Leave" };

/** Families request and follow leave for their children here. */
export default async function MyLeavePage({ searchParams }: PageProps<"/my/leave">) {
  const ctx = await requirePageContext();
  if (!ctx.guardianId && !ctx.studentId) redirect("/attendance/leave");
  if (!can(ctx, "leave.request")) redirect("/forbidden");
  const { status } = await searchParams;
  const statuses = typeof status === "string" && ["PENDING", "APPROVED", "REJECTED"].includes(status) ? [status] : undefined;
  const [list, subjects] = await Promise.all([listLeave(ctx, { page: 1, pageSize: 50, mine: false, status: statuses }), leaveSubjects(ctx)]);
  return <LeaveView rows={list.rows} total={list.total} pending={list.pending} page={1} pageSize={50} subjects={subjects} canRequest canReview={false} />;
}
