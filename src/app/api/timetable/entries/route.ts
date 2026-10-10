import { ok, route } from "@/server/http/api";
import { setTimetableEntry } from "@/server/modules/timetable/service";
import { timetableEntrySchema } from "@/lib/validation/timetable";

export const PUT = route({ permission: "timetable.manage", body: timetableEntrySchema }, async ({ ctx, body }) => ok(await setTimetableEntry(ctx, body), "Lesson saved."));
