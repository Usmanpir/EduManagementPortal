import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { auditFor } from "@/server/audit";
import type { TenantContext } from "@/server/auth/context";
import { assertWithinLimit } from "@/server/modules/billing/limits";
import { accessibleSectionIds } from "@/server/modules/academics/scope";
import { attachGuardian, resolveAdmissionNo, rollOrderOf } from "@/server/modules/people/students";
import { notifyUsers } from "@/server/modules/communication/notifications";
import { dateOnly } from "@/lib/format";
import { studentSchema, GUARDIAN_RELATIONS } from "@/lib/validation/people";
import { parseDateCell, parseGender, pick } from "./parse";

export const STUDENT_TEMPLATE_HEADERS = [
  "Admission No",
  "First Name",
  "Last Name",
  "Gender",
  "Date of Birth",
  "Campus",
  "Class",
  "Section",
  "Roll No",
  "B-Form",
  "Phone",
  "Email",
  "Address",
  "Guardian Name",
  "Guardian Relation",
  "Guardian Phone",
  "Guardian Email",
  "Guardian CNIC",
  "Admission Date",
];

export const STUDENT_TEMPLATE_EXAMPLE: Record<string, string> = {
  "Admission No": "",
  "First Name": "Ayesha",
  "Last Name": "Raza",
  Gender: "Female",
  "Date of Birth": "2012-04-15",
  Campus: "",
  Class: "Grade 8",
  Section: "A",
  "Roll No": "12",
  "B-Form": "35202-1234567-8",
  Phone: "",
  Email: "",
  Address: "House 4, Street 9, G-11/2, Islamabad",
  "Guardian Name": "Kamran Raza",
  "Guardian Relation": "Father",
  "Guardian Phone": "+92 300 1234567",
  "Guardian Email": "kamran.raza@example.com",
  "Guardian CNIC": "35202-7654321-1",
  "Admission Date": "",
};

export type RowError = { field: string; message: string };
export type ValidatedRow = { rowNumber: number; values: Record<string, string>; errors: RowError[] };

type Lookup = {
  campuses: { id: string; name: string; code: string }[];
  sections: { id: string; name: string; classId: string; className: string; campusId: string }[];
};

async function loadLookup(ctx: TenantContext): Promise<Lookup> {
  const allowed = await accessibleSectionIds(ctx);
  const campusFilter = ctx.allowedCampusIds ? { id: { in: ctx.allowedCampusIds } } : {};
  const [campuses, sections] = await Promise.all([
    ctx.db.campus.findMany({ where: { deletedAt: null, ...campusFilter }, select: { id: true, name: true, code: true } }),
    ctx.db.section.findMany({
      where: { deletedAt: null, class: { deletedAt: null }, ...(allowed ? { id: { in: allowed } } : {}), ...(ctx.allowedCampusIds ? { campusId: { in: ctx.allowedCampusIds } } : {}) },
      select: { id: true, name: true, classId: true, campusId: true, class: { select: { name: true } } },
    }),
  ]);
  return { campuses, sections: sections.map((s) => ({ id: s.id, name: s.name, classId: s.classId, className: s.class.name, campusId: s.campusId })) };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function parseRelation(v: string): (typeof GUARDIAN_RELATIONS)[number] | "invalid" {
  const s = norm(v);
  if (!s) return "GUARDIAN";
  const map: Record<string, (typeof GUARDIAN_RELATIONS)[number]> = {
    father: "FATHER",
    dad: "FATHER",
    mother: "MOTHER",
    mom: "MOTHER",
    guardian: "GUARDIAN",
    sibling: "SIBLING",
    brother: "SIBLING",
    sister: "SIBLING",
    other: "OTHER",
    uncle: "OTHER",
    aunt: "OTHER",
    grandfather: "OTHER",
    grandmother: "OTHER",
  };
  return map[s] ?? "invalid";
}

const FIELD_TO_COLUMN: Record<string, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  phone: "Phone",
  email: "Email",
  bFormNumber: "B-Form",
  rollNumber: "Roll No",
  admissionNo: "Admission No",
  address: "Address",
  "guardians.0.phone": "Guardian Phone",
  "guardians.0.email": "Guardian Email",
  "guardians.0.cnic": "Guardian CNIC",
  "guardians.0.firstName": "Guardian Name",
  "guardians.0.lastName": "Guardian Name",
};

/** Maps one spreadsheet row to the same input the Add Student form sends. */
function mapRow(raw: Record<string, string>, lookup: Lookup, defaultCampusId: string | null) {
  const errors: RowError[] = [];
  const v = (...a: string[]) => pick(raw, ...a);

  let campusId = defaultCampusId;
  const campusCell = v("Campus", "Campus Code", "Branch");
  if (campusCell) {
    const c = lookup.campuses.find((x) => norm(x.name) === norm(campusCell) || norm(x.code) === norm(campusCell));
    if (!c) errors.push({ field: "Campus", message: `No campus called “${campusCell}”.` });
    else campusId = c.id;
  } else if (!campusId) {
    if (lookup.campuses.length === 1) campusId = lookup.campuses[0]!.id;
    else errors.push({ field: "Campus", message: "Campus is required when you have more than one campus." });
  }

  let sectionId: string | null = null;
  const className = v("Class", "Grade", "Class Name");
  const sectionName = v("Section", "Section Name");
  if (className) {
    const inClass = lookup.sections.filter((s) => norm(s.className) === norm(className) && (!campusId || s.campusId === campusId));
    if (inClass.length === 0) errors.push({ field: "Class", message: `No class called “${className}” on this campus.` });
    else if (sectionName) {
      const s = inClass.find((x) => norm(x.name) === norm(sectionName));
      if (!s) errors.push({ field: "Section", message: `${className} has no section “${sectionName}”.` });
      else sectionId = s.id;
    } else if (inClass.length === 1) sectionId = inClass[0]!.id;
    else errors.push({ field: "Section", message: `${className} has several sections — say which one.` });
  } else if (sectionName) {
    errors.push({ field: "Class", message: "Add the class for this section." });
  }

  const gender = parseGender(v("Gender", "Sex"));
  if (gender === "invalid") errors.push({ field: "Gender", message: "Use Male, Female or Other." });
  const dob = parseDateCell(v("Date of Birth", "DOB", "Birth Date"));
  if (dob === "invalid") errors.push({ field: "Date of Birth", message: "Use a date like 2012-04-15 or 15/04/2012." });
  const admissionDate = parseDateCell(v("Admission Date", "Date of Admission"));
  if (admissionDate === "invalid") errors.push({ field: "Admission Date", message: "Use a date like 2026-08-01." });

  const guardianName = v("Guardian Name", "Parent Name", "Father Name", "Father's Name");
  const guardianPhone = v("Guardian Phone", "Parent Phone", "Father Phone", "Guardian Mobile");
  const relation = parseRelation(v("Guardian Relation", "Relation", "Relationship"));
  if (relation === "invalid") errors.push({ field: "Guardian Relation", message: "Use Father, Mother, Guardian, Sibling or Other." });
  const guardians = [];
  if (guardianName || guardianPhone) {
    if (!guardianName) errors.push({ field: "Guardian Name", message: "Add the guardian's name." });
    if (!guardianPhone) errors.push({ field: "Guardian Phone", message: "Add the guardian's phone number." });
    const [first, ...rest] = guardianName.split(/\s+/);
    guardians.push({
      firstName: first ?? "",
      lastName: rest.join(" ") || "-",
      relation: relation === "invalid" ? "GUARDIAN" : relation,
      phone: guardianPhone,
      email: v("Guardian Email", "Parent Email"),
      cnic: v("Guardian CNIC", "Father CNIC", "Parent CNIC"),
      isPrimary: true,
      receivesNotifications: true,
    });
  }

  const input = {
    firstName: v("First Name", "Firstname", "Given Name"),
    lastName: v("Last Name", "Surname", "Family Name") || "-",
    gender: gender === "invalid" ? null : gender,
    dateOfBirth: dob === "invalid" ? null : dob,
    bFormNumber: v("B-Form", "BForm", "B Form", "B-Form Number"),
    phone: v("Phone", "Student Phone", "Mobile"),
    email: v("Email", "Student Email"),
    address: v("Address"),
    campusId: campusId ?? "",
    sectionId,
    rollNumber: v("Roll No", "Roll Number", "Roll"),
    admissionNo: v("Admission No", "Admission Number", "Student ID", "Reg No"),
    admissionDate: admissionDate === "invalid" ? null : admissionDate,
    status: "ACTIVE",
    guardians,
  };
  if (!input.firstName) errors.push({ field: "First Name", message: "First name is required." });

  const parsed = studentSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      const column = FIELD_TO_COLUMN[key];
      if (key === "campusId" || key === "firstName") continue; // already reported above
      if (!errors.some((e) => e.field === (column ?? key))) errors.push({ field: column ?? key, message: issue.message });
    }
  }
  return { errors, input: parsed.success ? parsed.data : null };
}

/** Validates every row against the schema, the organization's classes and existing records. */
export async function validateStudentRows(ctx: TenantContext, rows: Record<string, string>[], startRow = 2) {
  const lookup = await loadLookup(ctx);
  const mapped = rows.map((raw, i) => ({ rowNumber: startRow + i, raw, ...mapRow(raw, lookup, ctx.campusId) }));

  // Duplicates against the database.
  const admissionNos = mapped.map((m) => m.input?.admissionNo).filter((x): x is string => !!x);
  const existing = admissionNos.length
    ? new Set((await ctx.db.student.findMany({ where: { admissionNo: { in: admissionNos } }, select: { admissionNo: true } })).map((s) => s.admissionNo))
    : new Set<string>();
  const sectionIds = [...new Set(mapped.map((m) => m.input?.sectionId).filter((x): x is string => !!x))];
  const rolls = sectionIds.length
    ? await ctx.db.student.findMany({ where: { sectionId: { in: sectionIds }, archivedAt: null, rollNumber: { not: null } }, select: { sectionId: true, rollNumber: true } })
    : [];
  const takenRolls = new Set(rolls.map((r) => `${r.sectionId}:${r.rollNumber}`));

  // Duplicates within the file.
  const seenAdmission = new Map<string, number>();
  const seenRoll = new Map<string, number>();
  for (const m of mapped) {
    if (!m.input) continue;
    const adm = m.input.admissionNo;
    if (adm) {
      if (existing.has(adm)) m.errors.push({ field: "Admission No", message: `${adm} already belongs to another student.` });
      else if (seenAdmission.has(adm)) m.errors.push({ field: "Admission No", message: `Duplicate of row ${seenAdmission.get(adm)}.` });
      else seenAdmission.set(adm, m.rowNumber);
    }
    if (m.input.sectionId && m.input.rollNumber) {
      const key = `${m.input.sectionId}:${m.input.rollNumber}`;
      if (takenRolls.has(key)) m.errors.push({ field: "Roll No", message: `Roll ${m.input.rollNumber} is already taken in this section.` });
      else if (seenRoll.has(key)) m.errors.push({ field: "Roll No", message: `Same roll number as row ${seenRoll.get(key)}.` });
      else seenRoll.set(key, m.rowNumber);
    }
  }
  return mapped;
}

export async function previewStudentImport(ctx: TenantContext, rows: Record<string, string>[]) {
  const validated = await validateStudentRows(ctx, rows);
  return validated.map<ValidatedRow>((m) => ({ rowNumber: m.rowNumber, values: m.raw, errors: m.errors }));
}

/**
 * Imports the rows that pass validation (re-checked on the server — the
 * client preview is never trusted) and records a summary batch.
 */
export async function commitStudentImport(ctx: TenantContext, fileName: string, rows: { rowNumber: number; values: Record<string, string> }[]) {
  const validated = await validateStudentRows(ctx, rows.map((r) => r.values));
  validated.forEach((v, i) => (v.rowNumber = rows[i]!.rowNumber));
  const valid = validated.filter((v) => v.errors.length === 0 && v.input);
  const failed = validated.filter((v) => v.errors.length > 0 || !v.input);
  if (valid.length > 0) await assertWithinLimit(ctx.orgId, "students", valid.length);

  const errors: { row: number; field: string; message: string }[] = failed.flatMap((f) => f.errors.map((e) => ({ row: f.rowNumber, ...e })));
  let imported = 0;

  for (const row of valid) {
    const input = row.input!;
    try {
      const admissionNo = await resolveAdmissionNo(ctx, input.admissionNo);
      await ctx.db.$transaction(async (tx) => {
        const section = input.sectionId ? await tx.section.findFirst({ where: { id: input.sectionId }, select: { classId: true } }) : null;
        const student = await tx.student.create({
          data: {
            organizationId: ctx.orgId,
            campusId: input.campusId,
            classId: section?.classId ?? null,
            sectionId: input.sectionId,
            admissionNo,
            rollNumber: input.rollNumber,
            rollOrder: rollOrderOf(input.rollNumber),
            firstName: input.firstName,
            lastName: input.lastName,
            gender: input.gender,
            dateOfBirth: input.dateOfBirth ? dateOnly(input.dateOfBirth) : null,
            bFormNumber: input.bFormNumber,
            phone: input.phone,
            email: input.email,
            address: input.address,
            admissionDate: dateOnly(input.admissionDate ?? new Date().toISOString().slice(0, 10)),
            status: "ACTIVE",
          },
        });
        for (const g of input.guardians ?? []) await attachGuardian(ctx, student.id, g, tx as unknown as TenantContext["db"]);
      });
      imported++;
    } catch (error) {
      errors.push({ row: row.rowNumber, field: "", message: error instanceof Error && "code" in error ? "This row conflicts with an existing record." : "Couldn't import this row." });
    }
  }

  const batch = await ctx.db.importBatch.create({
    data: {
      organizationId: ctx.orgId,
      type: "STUDENTS",
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
  await auditFor(ctx)({ action: "student.import", entityType: "import", entityId: batch.id, metadata: { fileName, imported, failed: rows.length - imported } });
  await notifyUsers(ctx.orgId, [
    {
      userId: ctx.user.id,
      type: "import.completed",
      title: "Student import finished",
      body: `${imported} imported${rows.length - imported ? `, ${rows.length - imported} need attention` : ""} from ${fileName}.`,
      link: "/students",
      dedupeKey: `import:${batch.id}`,
    },
  ]);
  return { batchId: batch.id, imported, failed: rows.length - imported, errors };
}
