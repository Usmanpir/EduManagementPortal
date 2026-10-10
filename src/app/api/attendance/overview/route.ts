import { z } from "zod";
import { canAny } from "@/server/auth/context";
import { ok, route } from "@/server/http/api";
import { forbidden } from "@/server/http/errors";
import { attendanceOverview } from "@/server/modules/attendance/register";
import { isoDate } from "@/lib/validation/common";
import { todayIn } from "@/lib/format";

export const GET = route({ query: z.object({ date: isoDate.optional() }) }, async ({ ctx, query }) => {
  if (!canAny(ctx, "attendance.view", "attendance.mark")) throw forbidden();
  return ok(await attendanceOverview(ctx, query.date ?? todayIn(ctx.organization.timezone)));
});
