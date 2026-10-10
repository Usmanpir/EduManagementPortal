import { z } from "zod";
import { optionalUuid, uuid } from "./common";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM.");

export const periodsSchema = z
  .object({
    campusId: uuid,
    periods: z
      .array(z.object({ id: optionalUuid, name: z.string().trim().min(1, "Name is required.").max(30), start: time, end: time, isBreak: z.boolean().default(false) }))
      .min(1, "Add at least one period.")
      .max(16),
  })
  .superRefine((v, ctx) => {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    v.periods.forEach((p, i) => {
      if (toMin(p.end) <= toMin(p.start)) ctx.addIssue({ code: "custom", message: "Ends before it starts.", path: ["periods", i, "end"] });
      const prev = v.periods[i - 1];
      if (prev && toMin(p.start) < toMin(prev.end)) ctx.addIssue({ code: "custom", message: "Overlaps the previous period.", path: ["periods", i, "start"] });
    });
  });

export const timetableEntrySchema = z.object({
  sectionId: uuid,
  dayOfWeek: z.number().int().min(1).max(7),
  periodId: uuid,
  subjectId: uuid,
  teacherId: optionalUuid,
  roomId: optionalUuid,
});
