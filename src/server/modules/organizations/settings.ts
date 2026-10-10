import { z } from "zod";

const gradeBand = z.object({ grade: z.string().min(1).max(4), min: z.number().min(0).max(100), remark: z.string().max(40) });

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM, e.g. 08:15.");

/*
 * Each section uses `.prefault({})`: a missing section is parsed as an empty
 * object, so every field falls back to its own default and new fields added
 * later appear automatically for existing organizations.
 */
export const orgSettingsSchema = z.object({
  attendance: z
    .object({
      /** DAILY: one roll-call per section per day. PERIOD: one per timetable period. */
      mode: z.enum(["DAILY", "PERIOD"]).default("DAILY"),
      lowAttendanceThreshold: z.number().int().min(50).max(100).default(75),
      notifyGuardiansOnAbsence: z.boolean().default(true),
      notifyGuardiansOnLate: z.boolean().default(false),
      alertRecipients: z
        .object({ guardian: z.boolean().default(true), student: z.boolean().default(false), classTeacher: z.boolean().default(true) })
        .prefault({}),
      /** Teachers may change attendance up to this many days back; older edits need attendance.edit or a correction request. */
      teacherEditWindowDays: z.number().int().min(0).max(30).default(1),
      /** ISO weekdays that are not school days. */
      weeklyOffDays: z.array(z.number().int().min(1).max(7)).default([7]),
      /** Staff checking in after this time are marked late. */
      staffLateAfter: time.default("08:15"),
      /** Allow staff to check in by scanning the campus QR code. */
      staffQrCheckIn: z.boolean().default(true),
    })
    .prefault({}),
  finance: z
    .object({
      invoicePrefix: z.string().max(8).default("INV"),
      receiptPrefix: z.string().max(8).default("RCP"),
      lateFee: z.number().min(0).default(0),
      lateFeeGraceDays: z.number().int().min(0).max(60).default(0),
      reminderDaysBeforeDue: z.number().int().min(0).max(30).default(3),
      invoiceFooter: z.string().max(500).default(""),
    })
    .prefault({}),
  exams: z
    .object({
      passPercentage: z.number().min(0).max(100).default(40),
      showPosition: z.boolean().default(true),
      gradingScale: z.array(gradeBand).min(1).default([
        { grade: "A+", min: 90, remark: "Outstanding" },
        { grade: "A", min: 80, remark: "Excellent" },
        { grade: "B", min: 70, remark: "Very good" },
        { grade: "C", min: 60, remark: "Good" },
        { grade: "D", min: 50, remark: "Satisfactory" },
        { grade: "E", min: 40, remark: "Pass" },
        { grade: "F", min: 0, remark: "Needs improvement" },
      ]),
      reportCardFooter: z.string().max(500).default(""),
    })
    .prefault({}),
  notifications: z
    .object({
      email: z.boolean().default(true),
      sms: z.boolean().default(false),
      whatsapp: z.boolean().default(false),
      dailySummaryToAdmins: z.boolean().default(true),
    })
    .prefault({}),
  /** Optional regional identity fields (e.g. Pakistan CNIC / B-Form). */
  identity: z
    .object({
      studentBForm: z.boolean().default(true),
      studentCnic: z.boolean().default(false),
      guardianCnic: z.boolean().default(true),
      staffCnic: z.boolean().default(true),
    })
    .prefault({}),
  branding: z.object({ emailFooter: z.string().max(500).default("") }).prefault({}),
  onboarding: z.object({ completedSteps: z.array(z.string()).default([]), dismissed: z.boolean().default(false) }).prefault({}),
});

export type OrgSettings = z.infer<typeof orgSettingsSchema>;

export function parseOrgSettings(raw: unknown): OrgSettings {
  const parsed = orgSettingsSchema.safeParse(raw ?? {});
  // Corrupt settings must never lock an organization out — fall back to defaults.
  return parsed.success ? parsed.data : orgSettingsSchema.parse({});
}

/** "08:15" → minutes from midnight. */
export function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Regional defaults applied when an organization is created. */
export function defaultSettingsForCountry(country: string): OrgSettings {
  const base = orgSettingsSchema.parse({});
  if (country !== "PK") {
    base.identity = { studentBForm: false, studentCnic: false, guardianCnic: false, staffCnic: false };
  }
  if (["AE", "SA", "QA", "KW", "BH", "OM"].includes(country)) {
    base.attendance.weeklyOffDays = [5, 6];
  }
  return base;
}
