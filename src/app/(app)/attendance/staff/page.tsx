import type { Metadata } from "next";
import { can, requirePageContext } from "@/server/auth/context";
import { getStaffRegister } from "@/server/modules/attendance/staff";
import { todayIn } from "@/lib/format";
import { StaffRegisterView } from "./staff-register-view";

export const metadata: Metadata = { title: "Staff attendance" };

export default async function StaffAttendancePage({ searchParams }: PageProps<"/attendance/staff">) {
  const ctx = await requirePageContext("staff_attendance.view");
  const today = todayIn(ctx.organization.timezone);
  const { date: raw } = await searchParams;
  const date = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today ? raw : today;
  const register = await getStaffRegister(ctx, date);
  return (
    <StaffRegisterView
      register={register}
      today={today}
      canMark={can(ctx, "staff_attendance.mark")}
      qrEnabled={ctx.settings.attendance.staffQrCheckIn}
      lateAfter={ctx.settings.attendance.staffLateAfter}
    />
  );
}
