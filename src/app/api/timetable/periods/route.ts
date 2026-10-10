import { z } from "zod";
import { ok, route } from "@/server/http/api";
import { listPeriods, savePeriods } from "@/server/modules/timetable/service";
import { periodsSchema } from "@/lib/validation/timetable";

export const GET = route({ permission: "timetable.view", query: z.object({ campusId: z.uuid() }) }, async ({ ctx, query }) => ok(await listPeriods(ctx, query.campusId)));

export const PUT = route({ permission: "timetable.manage", body: periodsSchema }, async ({ ctx, body }) => {
  await savePeriods(ctx, body);
  return ok(null, "Bell schedule saved.");
});
