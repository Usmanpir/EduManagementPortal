import type { Metadata } from "next";
import { requirePageContext } from "@/server/auth/context";
import { deviceKeyStatus } from "@/server/modules/attendance/staff";
import { AttendanceSettingsForm } from "./attendance-settings-form";

export const metadata: Metadata = { title: "Attendance settings" };

export default async function AttendanceSettingsPage() {
  const ctx = await requirePageContext("settings.manage");
  const device = await deviceKeyStatus(ctx);
  return <AttendanceSettingsForm initial={ctx.settings.attendance} device={device} />;
}
