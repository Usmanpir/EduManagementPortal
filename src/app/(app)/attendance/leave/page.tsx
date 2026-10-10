import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can, canAny, requirePageContext } from "@/server/auth/context";
import { leaveSubjects, listLeave } from "@/server/modules/attendance/leave";
import { pagination } from "@/lib/validation/common";
import { csvList } from "@/lib/validation/query";
import { LeaveView } from "./leave-view";

export const metadata: Metadata = { title: "Leave" };

const params = pagination.extend({ status: csvList, requesterType: csvList, mine: z.enum(["1"]).optional() });

export default async function LeavePage({ searchParams }: PageProps<"/attendance/leave">) {
  const ctx = await requirePageContext();
  if (!canAny(ctx, "leave.view", "leave.request", "leave.review")) redirect("/forbidden");
  const query = params.parse(await searchParams);
  const [list, subjects] = await Promise.all([listLeave(ctx, { ...query, mine: query.mine === "1" }), leaveSubjects(ctx)]);
  return (
    <LeaveView
      rows={list.rows}
      total={list.total}
      pending={list.pending}
      page={query.page}
      pageSize={query.pageSize}
      subjects={subjects}
      canRequest={can(ctx, "leave.request")}
      canReview={can(ctx, "leave.review")}
    />
  );
}
