import { ok, route, uuidParam } from "@/server/http/api";
import { clearTimetableEntry } from "@/server/modules/timetable/service";

export const DELETE = route({ permission: "timetable.manage" }, async ({ ctx, params }) => {
  await clearTimetableEntry(ctx, uuidParam(params, "id"));
  return ok(null, "Lesson removed.");
});
