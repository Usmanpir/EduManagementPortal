import { z } from "zod";
import { isoDate, optionalText, optionalUuid, requiredText, uuid } from "./common";

const optionalInt = (min: number, max: number) =>
  z
    .union([z.literal(""), z.null(), z.coerce.number().int().min(min, `Must be at least ${min}.`).max(max, `Must be ${max} or less.`)])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : v));

export const academicYearSchema = z
  .object({
    name: requiredText("Name", 40),
    startDate: isoDate,
    endDate: isoDate,
    isCurrent: z.boolean().default(false),
  })
  .refine((v) => v.endDate > v.startDate, { message: "End date must be after the start date.", path: ["endDate"] });

export const departmentSchema = z.object({
  name: requiredText("Department name", 80),
  code: z.string().trim().toUpperCase().min(1, "Code is required.").max(12).regex(/^[A-Z0-9-]+$/, "Use letters, numbers and dashes."),
  description: optionalText(300),
});

export const classSchema = z.object({
  name: requiredText("Class name", 60),
  level: z.coerce.number().int().min(0).max(30),
  campusId: uuid,
  departmentId: optionalUuid,
  description: optionalText(300),
  /** Create these sections together with the class, e.g. ["A","B","C"]. */
  sections: z.array(z.string().trim().min(1).max(20)).max(26).optional(),
});

export const sectionSchema = z.object({
  classId: uuid,
  name: requiredText("Section name", 20),
  capacity: optionalInt(1, 500),
  classTeacherId: optionalUuid,
  roomId: optionalUuid,
  academicYearId: optionalUuid,
});

export const SUBJECT_TYPES = ["CORE", "ELECTIVE", "LAB", "ACTIVITY"] as const;

export const subjectSchema = z.object({
  name: requiredText("Subject name", 80),
  code: z.string().trim().toUpperCase().min(1, "Code is required.").max(12).regex(/^[A-Z0-9-]+$/, "Use letters, numbers and dashes."),
  type: z.enum(SUBJECT_TYPES),
  departmentId: optionalUuid,
  color: z
    .union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/)])
    .optional()
    .nullable()
    .transform((v) => v || null),
});

export const classSubjectsSchema = z.object({
  subjects: z.array(z.object({ subjectId: uuid, periodsPerWeek: optionalInt(0, 40) })).max(60),
});

export const ROOM_TYPES = ["CLASSROOM", "LAB", "LIBRARY", "HALL", "OFFICE", "OTHER"] as const;

export const roomSchema = z.object({
  campusId: uuid,
  name: requiredText("Room name", 60),
  code: optionalText(20),
  capacity: optionalInt(1, 2000),
  type: z.enum(ROOM_TYPES),
});

export const teachingAssignmentSchema = z.object({
  sectionId: uuid,
  subjectId: uuid,
  teacherId: uuid.nullable(),
});
