import type { Metadata } from "next";
import { can, requirePageContext } from "@/server/auth/context";
import { attendanceReport } from "@/server/modules/attendance/report";
import { peopleLookups } from "@/server/modules/people/lookups";
import { addDays, todayIn } from "@/lib/format";
import { ReportView } from "./report-view";

export const metadata: Metadata = { title: "Attendance reports" };

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function AttendanceReportsPage({ searchParams }: PageProps<"/attendance/reports">) {
  const ctx = await requirePageContext("attendance.view");
  const sp = await searchParams;
  const today = todayIn(ctx.organization.timezone);
  let to = isDate(sp.to) && sp.to <= today ? sp.to : today;
  let from = isDate(sp.from) ? sp.from : addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  const classId = typeof sp.classId === "string" && /^[0-9a-f-]{36}$/i.test(sp.classId) ? sp.classId : null;
  const sectionId = typeof sp.sectionId === "string" && /^[0-9a-f-]{36}$/i.test(sp.sectionId) ? sp.sectionId : null;

  const [report, lookups] = await Promise.all([attendanceReport(ctx, { from, to, classId, sectionId }), peopleLookups(ctx)]);
  return <ReportView report={report} lookups={lookups} today={today} threshold={ctx.settings.attendance.lowAttendanceThreshold} canExport={can(ctx, "reports.export")} />;
}
