import { z } from "zod";
import { isoDate, optionalText, optionalUuid, uuid } from "./common";

export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "LEAVE"] as const;
export const STAFF_ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "LEAVE", "HALF_DAY"] as const;
export type AttendanceStatusValue = (typeof ATTENDANCE_STATUSES)[number];

export const saveRegisterSchema = z.object({
  sectionId: uuid,
  date: isoDate,
  periodId: optionalUuid,
  records: z
    .array(z.object({ studentId: uuid, status: z.enum(ATTENDANCE_STATUSES), note: optionalText(200) }))
    .min(1, "There are no students to mark.")
    .max(300),
});

export const correctionRequestSchema = z.object({
  sectionId: uuid,
  date: isoDate,
  periodId: optionalUuid,
  reason: z.string().trim().min(3, "Explain why the attendance needs to change.").max(300),
  changes: z.array(z.object({ studentId: uuid, status: z.enum(ATTENDANCE_STATUSES) })).min(1).max(300),
});

export const reviewSchema = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), note: optionalText(300) });

export const saveStaffRegisterSchema = z.object({
  date: isoDate,
  records: z
    .array(
      z.object({
        staffId: uuid,
        status: z.enum(STAFF_ATTENDANCE_STATUSES),
        checkIn: z
          .union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)])
          .optional()
          .nullable()
          .transform((v) => v || null),
        note: optionalText(200),
      }),
    )
    .min(1)
    .max(1000),
});

export const LEAVE_TYPES = ["SICK", "CASUAL", "ANNUAL", "EMERGENCY", "MATERNITY", "OTHER"] as const;

export const leaveRequestSchema = z
  .object({
    requesterType: z.enum(["STUDENT", "STAFF"]),
    studentId: optionalUuid,
    /** Omit to request leave for yourself (staff). */
    staffId: optionalUuid,
    type: z.enum(LEAVE_TYPES),
    startDate: isoDate,
    endDate: isoDate,
    reason: z.string().trim().min(3, "Add a short reason.").max(500),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "The end date can't be before the start date.", path: ["endDate"] })
  .refine((v) => v.requesterType !== "STUDENT" || !!v.studentId, { message: "Choose a student.", path: ["studentId"] });
