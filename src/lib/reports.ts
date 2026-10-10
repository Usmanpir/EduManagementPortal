import { z } from "zod";
import type { PermissionKey } from "./permissions";

/** Report catalog shared by the server (running) and the browser (filters, formatting). */

export type FilterKind = "dateRange" | "month" | "class" | "section" | "exam" | "method" | "studentStatus" | "limit";
export type ColumnFormat = "text" | "number" | "money" | "percent" | "date";
export type ReportColumn = { key: string; label: string; format?: ColumnFormat; /** Shaded column, e.g. a weekly holiday in a register. */ muted?: boolean };
export type ReportCell = string | number | null;
export type ReportResult = {
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  summary?: { label: string; value: ReportCell; format?: ColumnFormat }[];
  /** Shown above the table, e.g. "Results are provisional". */
  note?: string;
};

export type ReportMeta = {
  key: string;
  title: string;
  description: string;
  category: "Attendance" | "Finance" | "Exams" | "Students & staff";
  /** All are required, in addition to reports.view. */
  permissions: PermissionKey[];
  filters: FilterKind[];
  /** Filters that must be chosen before the report can run. */
  required?: FilterKind[];
};

export const REPORTS: ReportMeta[] = [
  { key: "attendance-students", title: "Student attendance summary", description: "Present, late, absent and leave days with the attendance rate for every student.", category: "Attendance", permissions: ["attendance.view"], filters: ["dateRange", "class", "section"] },
  { key: "attendance-register", title: "Monthly attendance register", description: "The classic register: one row per student, one column per day of the month.", category: "Attendance", permissions: ["attendance.view"], filters: ["month", "section"], required: ["section"] },
  { key: "attendance-low", title: "Low attendance", description: "Students below the school's attendance target, lowest first — with a parent's phone number.", category: "Attendance", permissions: ["attendance.view", "students.view"], filters: ["dateRange", "class"] },
  { key: "staff-attendance", title: "Staff attendance summary", description: "Days present, late, absent and on leave for each staff member.", category: "Attendance", permissions: ["staff_attendance.view"], filters: ["dateRange"] },
  { key: "fee-collections", title: "Fee collections", description: "Every payment received in a period, with totals by method — for reconciling the cash book.", category: "Finance", permissions: ["payments.view"], filters: ["dateRange", "method"] },
  { key: "fee-outstanding", title: "Outstanding fees", description: "Who owes what today, largest balance first, with guardian contact details.", category: "Finance", permissions: ["invoices.view"], filters: ["class"] },
  { key: "fee-by-class", title: "Collection by class", description: "Billed, collected and outstanding amounts for each class.", category: "Finance", permissions: ["invoices.view"], filters: ["dateRange"] },
  { key: "exam-subjects", title: "Subject analysis", description: "Average, highest, lowest and pass rate for every paper in an exam.", category: "Exams", permissions: ["results.view"], filters: ["exam", "class"], required: ["exam"] },
  { key: "exam-toppers", title: "Top performers", description: "The highest-scoring students in each section for an exam.", category: "Exams", permissions: ["results.view"], filters: ["exam", "limit"], required: ["exam"] },
  { key: "students-roster", title: "Student roster", description: "Students with class, roll number and primary guardian.", category: "Students & staff", permissions: ["students.view"], filters: ["class", "section", "studentStatus"] },
  { key: "enrollment", title: "Enrollment by class", description: "Active students per class and section, with boys/girls and capacity.", category: "Students & staff", permissions: ["students.view"], filters: [] },
];

export const reportMeta = (key: string) => REPORTS.find((r) => r.key === key) ?? null;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optId = z.uuid().optional().catch(undefined);

/** Raw URL params → typed report params. Invalid values fall back to defaults instead of failing. */
export const reportParamsSchema = z.object({
  from: isoDate.optional().catch(undefined),
  to: isoDate.optional().catch(undefined),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().catch(undefined),
  classId: optId,
  sectionId: optId,
  examId: optId,
  method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "ONLINE", "MOBILE_WALLET", "OTHER"]).optional().catch(undefined),
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED"]).optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(50).optional().catch(undefined),
});
export type ReportParams = z.output<typeof reportParamsSchema>;
