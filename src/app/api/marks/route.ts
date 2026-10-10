import { z } from "zod";
import { ok, route } from "@/server/http/api";
import { getMarksSheet, saveMarks } from "@/server/modules/exams/marks";
import { saveMarksSchema } from "@/lib/validation/exams";
import { uuid } from "@/lib/validation/common";

export const GET = route({ permission: "marks.enter", query: z.object({ examSubjectId: uuid, sectionId: uuid }) }, async ({ ctx, query }) => ok(await getMarksSheet(ctx, query.examSubjectId, query.sectionId)));

export const PUT = route({ permission: "marks.enter", body: saveMarksSchema }, async ({ ctx, body }) => {
  const r = await saveMarks(ctx, body);
  return ok(r, `Marks saved for ${r.saved} student${r.saved === 1 ? "" : "s"}.`);
});
