import { z } from "zod";
import { isoDate, optionalText, optionalUuid, uuid } from "./common";

export const EXAM_TYPES = ["QUIZ", "MONTHLY", "MIDTERM", "FINAL", "MOCK", "OTHER"] as const;

const marks = (label: string) => z.coerce.number({ error: `${label} must be a number.` }).min(0, `${label} can't be negative.`).max(1000, `${label} is too large.`);
const time = z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM.")]).optional().nullable().transform((v) => (v ? v : null));

export const examSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(80),
    type: z.enum(EXAM_TYPES),
    startDate: isoDate,
    endDate: isoDate,
    campusId: optionalUuid,
    description: optionalText(500),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "Ends before it starts." });

export const createExamSchema = examSchema.and(
  z.object({
    classIds: z.array(uuid).min(1, "Choose at least one class.").max(60),
    maxMarks: marks("Total marks").refine((v) => v > 0, "Total marks must be more than zero.").default(100),
    passMarks: marks("Pass marks").default(40),
  }),
);

export const scheduleSchema = z.object({
  classId: uuid,
  subjects: z
    .array(
      z
        .object({
          subjectId: uuid,
          date: z.union([z.literal(""), isoDate]).optional().nullable().transform((v) => (v ? v : null)),
          start: time,
          end: time,
          roomId: optionalUuid,
          maxMarks: marks("Total marks").refine((v) => v > 0, "Must be more than zero."),
          passMarks: marks("Pass marks"),
        })
        .refine((s) => s.passMarks <= s.maxMarks, { path: ["passMarks"], message: "More than the total." })
        .refine((s) => !s.start || !s.end || s.end > s.start, { path: ["end"], message: "Ends before it starts." }),
    )
    .max(30),
});

export const examStatusSchema = z.object({ status: z.enum(["DRAFT", "SCHEDULED"]) });

export const saveMarksSchema = z.object({
  examSubjectId: uuid,
  sectionId: uuid,
  marks: z
    .array(
      z.object({
        studentId: uuid,
        /** null = not entered yet (row cleared). */
        marks: z.union([z.null(), z.literal(""), z.coerce.number().min(0).max(1000)]).transform((v) => (v === "" ? null : v)),
        absent: z.boolean().default(false),
        remarks: optionalText(120),
      }),
    )
    .max(200),
});

export const publishSchema = z.object({ publish: z.boolean(), notify: z.boolean().default(true) });
