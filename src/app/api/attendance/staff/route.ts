import { z } from "zod";
import { ok, route } from "@/server/http/api";
import { getStaffRegister, saveStaffRegister } from "@/server/modules/attendance/staff";
import { isoDate, optionalUuid } from "@/lib/validation/common";
import { saveStaffRegisterSchema } from "@/lib/validation/attendance";
import { todayIn } from "@/lib/format";

export const GET = route({ permission: "staff_attendance.view", query: z.object({ date: isoDate.optional(), departmentId: optionalUuid }) }, async ({ ctx, query }) =>
  ok(await getStaffRegister(ctx, query.date ?? todayIn(ctx.organization.timezone), query.departmentId ?? undefined)),
);

export const POST = route({ permission: "staff_attendance.mark", body: saveStaffRegisterSchema }, async ({ ctx, body }) => {
  const result = await saveStaffRegister(ctx, body);
  return ok(result, "Staff attendance saved.");
});
