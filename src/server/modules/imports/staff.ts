import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { auditFor } from "@/server/audit";
import type { TenantContext } from "@/server/auth/context";
import { assertWithinLimit } from "@/server/modules/billing/limits";
import { createStaff } from "@/server/modules/people/staff";
import { notifyUsers } from "@/server/modules/communication/notifications";
import { staffSchema } from "@/lib/validation/people";
import { parseDateCell, parseGender, pick } from "./parse";
import type { RowError, ValidatedRow } from "./students";

export const STAFF_TEMPLATE_HEADERS = [
  "Employee ID",
  "First Name",
  "Last Name",
  "Type",
  "Designation",
  "Department",
  "Campus",
  "Gender",
  "Phone",
  "Email",
  "CNIC",
  "Joining Date",
  "Qualification",
  "Specialization",
];

export const STAFF_TEMPLATE_EXAMPLE: Record<string, string> = {
  "Employee ID": "",
  "First Name": "Sana",
  "Last Name": "Javed",
  Type: "Teacher",
  Designation: "Senior Teacher",
  Department: "Science & Mathematics",
  Campus: "",
  Gender: "Female",
  Phone: "+92 321 7654321",
  Email: "sana.javed@example.com",
  CNIC: "61101-1234567-2",
  "Joining Date": "2024-08-01",
  Qualification: "M.Sc Physics",
  Specialization: "Physics",
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export async function validateStaffRows(ctx: TenantContext, rows: Record<string, string>[], startRow = 2) {
  const [campuses, departments] = await Promise.all([
    ctx.db.campus.findMany({ where: { deletedAt: null, ...(ctx.allowedCampusIds ? { id: { in: ctx.allowedCampusIds } } : {}) }, select: { id: true, name: true, code: true } }),
    ctx.db.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true } }),
  ]);

  const mapped = rows.map((raw, i) => {
    const errors: RowError[] = [];
    const v = (...a: string[]) => pick(raw, ...a);

    let campusId = ctx.campusId;
    const campusCell = v("Campus", "Branch");
    if (campusCell) {
      const c = campuses.find((x) => norm(x.name) === norm(campusCell) || norm(x.code) === norm(campusCell));
      if (!c) errors.push({ field: "Campus", message: `No campus called “${campusCell}”.` });
      else campusId = c.id;
    } else if (!campusId) {
      if (campuses.length === 1) campusId = campuses[0]!.id;
      else errors.push({ field: "Campus", message: "Campus is required when you have more than one campus." });
    }

    let departmentId: string | null = null;
    const deptCell = v("Department");
    if (deptCell) {
      const d = departments.find((x) => norm(x.name) === norm(deptCell) || norm(x.code) === norm(deptCell));
      if (!d) errors.push({ field: "Department", message: `No department called “${deptCell}”.` });
      else departmentId = d.id;
    }

    const typeCell = norm(v("Type", "Role", "Staff Type"));
    if (typeCell && !["teacher", "staff", "teaching", "non-teaching", "non teaching"].includes(typeCell)) {
      errors.push({ field: "Type", message: "Use Teacher or Staff." });
    }
    const gender = parseGender(v("Gender"));
    if (gender === "invalid") errors.push({ field: "Gender", message: "Use Male, Female or Other." });
    const joining = parseDateCell(v("Joining Date", "Date of Joining", "Joined"));
    if (joining === "invalid") errors.push({ field: "Joining Date", message: "Use a date like 2024-08-01." });

    const input = {
      firstName: v("First Name"),
      lastName: v("Last Name", "Surname") || "-",
      gender: gender === "invalid" ? null : gender,
      cnic: v("CNIC"),
      phone: v("Phone", "Mobile"),
      email: v("Email"),
      campusId: campusId ?? "",
      departmentId,
      designation: v("Designation", "Job Title", "Position") || (typeCell.startsWith("teach") ? "Teacher" : ""),
      employeeCode: v("Employee ID", "Employee Code", "Staff ID"),
      joiningDate: joining === "invalid" ? null : joining,
      status: "ACTIVE",
      isTeacher: typeCell === "teacher" || typeCell === "teaching",
      qualification: v("Qualification"),
      specialization: v("Specialization", "Subject"),
      inviteToSignIn: false,
    };
    if (!input.firstName) errors.push({ field: "First Name", message: "First name is required." });
    if (!input.designation) errors.push({ field: "Designation", message: "Designation is required." });
    const parsed = staffSchema.safeParse(input);
    if (!parsed.success) {
      const cols: Record<string, string> = { phone: "Phone", email: "Email", cnic: "CNIC", employeeCode: "Employee ID" };
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (["campusId", "firstName", "designation"].includes(key)) continue;
        errors.push({ field: cols[key] ?? key, message: issue.message });
      }
    }
    return { rowNumber: startRow + i, raw, errors, input: parsed.success ? parsed.data : null };
  });

  const codes = mapped.map((m) => m.input?.employeeCode).filter((x): x is string => !!x);
  const emails = mapped.map((m) => m.input?.email).filter((x): x is string => !!x);
  const [existingCodes, existingEmails] = await Promise.all([
    codes.length ? ctx.db.staff.findMany({ where: { employeeCode: { in: codes } }, select: { employeeCode: true } }) : [],
    emails.length ? ctx.db.staff.findMany({ where: { email: { in: emails }, deletedAt: null }, select: { email: true } }) : [],
  ]);
  const codeSet = new Set(existingCodes.map((c) => c.employeeCode));
  const emailSet = new Set(existingEmails.map((e) => e.email));
  const seenCode = new Map<string, number>();
  const seenEmail = new Map<string, number>();
  for (const m of mapped) {
    const code = m.input?.employeeCode;
    if (code) {
      if (codeSet.has(code)) m.errors.push({ field: "Employee ID", message: `${code} already belongs to someone.` });
      else if (seenCode.has(code)) m.errors.push({ field: "Employee ID", message: `Duplicate of row ${seenCode.get(code)}.` });
      else seenCode.set(code, m.rowNumber);
    }
    const email = m.input?.email;
    if (email) {
      if (emailSet.has(email)) m.errors.push({ field: "Email", message: "Another staff member uses this email." });
      else if (seenEmail.has(email)) m.errors.push({ field: "Email", message: `Same email as row ${seenEmail.get(email)}.` });
      else seenEmail.set(email, m.rowNumber);
    }
  }
  return mapped;
}

export async function previewStaffImport(ctx: TenantContext, rows: Record<string, string>[]) {
  return (await validateStaffRows(ctx, rows)).map<ValidatedRow>((m) => ({ rowNumber: m.rowNumber, values: m.raw, errors: m.errors }));
}

export async function commitStaffImport(ctx: TenantContext, fileName: string, rows: { rowNumber: number; values: Record<string, string> }[]) {
  const validated = await validateStaffRows(ctx, rows.map((r) => r.values));
  validated.forEach((v, i) => (v.rowNumber = rows[i]!.rowNumber));
  const valid = validated.filter((v) => v.errors.length === 0 && v.input);
  if (valid.length) {
    await assertWithinLimit(ctx.orgId, "staff", valid.length);
    const teachers = valid.filter((v) => v.input!.isTeacher).length;
    if (teachers) await assertWithinLimit(ctx.orgId, "teachers", teachers);
  }
  const errors = validated.filter((v) => v.errors.length || !v.input).flatMap((f) => f.errors.map((e) => ({ row: f.rowNumber, ...e })));
  let imported = 0;
  for (const row of valid) {
    try {
      await createStaff(ctx, row.input!);
      imported++;
    } catch (error) {
      errors.push({ row: row.rowNumber, field: "", message: error instanceof Error ? error.message : "Couldn't import this row." });
    }
  }
  const batch = await ctx.db.importBatch.create({
    data: {
      organizationId: ctx.orgId,
      type: "STAFF",
      fileName,
      status: imported > 0 ? "COMPLETED" : "FAILED",
      totalRows: rows.length,
      importedRows: imported,
      failedRows: rows.length - imported,
      errors: errors as unknown as Prisma.InputJsonValue,
      createdById: ctx.user.id,
      completedAt: new Date(),
    },
  });
  await auditFor(ctx)({ action: "staff.import", entityType: "import", entityId: batch.id, metadata: { fileName, imported, failed: rows.length - imported } });
  await notifyUsers(ctx.orgId, [
    { userId: ctx.user.id, type: "import.completed", title: "Staff import finished", body: `${imported} imported from ${fileName}.`, link: "/staff", dedupeKey: `import:${batch.id}` },
  ]);
  return { batchId: batch.id, imported, failed: rows.length - imported, errors };
}
