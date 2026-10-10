import { z } from "zod";
import { canAny } from "@/server/auth/context";
import { ok, route } from "@/server/http/api";
import { forbidden } from "@/server/http/errors";
import { getRegister, saveRegister } from "@/server/modules/attendance/register";
import { isoDate, optionalUuid, uuid } from "@/lib/validation/common";
import { saveRegisterSchema } from "@/lib/validation/attendance";

const query = z.object({ sectionId: uuid, date: isoDate, periodId: optionalUuid });

export const GET = route({ anyPermission: ["attendance.view", "attendance.mark"], query }, async ({ ctx, query }) => {
  if (!canAny(ctx, "attendance.view", "attendance.mark")) throw forbidden();
  return ok(await getRegister(ctx, query));
});

export const POST = route({ permission: "attendance.mark", body: saveRegisterSchema }, async ({ ctx, body }) => {
  const result = await saveRegister(ctx, body);
  return ok(result, "Attendance saved.");
});
