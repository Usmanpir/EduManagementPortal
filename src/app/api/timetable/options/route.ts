import { z } from "zod";
import { ok, route } from "@/server/http/api";
import { sectionEditorOptions } from "@/server/modules/timetable/service";

export const GET = route({ permission: "timetable.manage", query: z.object({ sectionId: z.uuid() }) }, async ({ ctx, query }) => ok(await sectionEditorOptions(ctx, query.sectionId)));
