import { z } from "zod";
import { ok, route } from "@/server/http/api";
import { getTimetable } from "@/server/modules/timetable/service";

const query = z.object({ kind: z.enum(["section", "teacher", "room"]), id: z.uuid() });

export const GET = route({ permission: "timetable.view", query }, async ({ ctx, query }) => ok(await getTimetable(ctx, query.kind, query.id)));
