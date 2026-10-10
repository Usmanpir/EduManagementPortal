import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import type { AcademicsSeed } from "./academics";
import { SUBJECTS } from "./academics";
import type { DemoContext } from "./demo";
import { cnicNumber, createRandom, FEMALE_NAMES, ISB_AREAS, MALE_NAMES, phoneNumber, RWP_AREAS, SURNAMES } from "./random";

const r = createRandom(42);

type Campus = "isb" | "rwp";

/** Specialists per subject; primary teachers cover several subjects. */
const SPECIALISTS: Record<string, string> = {
  ENG: "English", URD: "Urdu", MATH: "Mathematics", GSCI: "General Science", PHY: "Physics", CHEM: "Chemistry",
  BIO: "Biology", CS: "Computer Science", ISL: "Islamiat", PST: "Pakistan Studies", SST: "Social Studies", ART: "Art", PE: "Physical Education",
};

async function seedStaff(ctx: DemoContext, academics: AcademicsSeed) {
  const orgId = ctx.orgId;
  const deptByCode = Object.fromEntries((await db.department.findMany({ where: { organizationId: orgId } })).map((d) => [d.code, d.id]));
  const subjectDept = Object.fromEntries(SUBJECTS.map((s) => [s.code, s.dept]));
  let code = 1;
  const nextCode = () => `EMP-${String(code++).padStart(3, "0")}`;
  const teachersBySubject: Record<Campus, Record<string, string[]>> = { isb: {}, rwp: {} };
  const staffByCampus: Record<Campus, string[]> = { isb: [], rwp: [] };

  const createPerson = async (campus: Campus, data: { firstName: string; lastName: string; female: boolean; designation: string; dept?: string; teacherOf?: string[]; userId?: string; email?: string }) => {
    const staff = await db.staff.create({
      data: {
        organizationId: orgId,
        campusId: ctx.campuses[campus],
        employeeCode: nextCode(),
        firstName: data.firstName,
        lastName: data.lastName,
        gender: data.female ? "FEMALE" : "MALE",
        cnic: cnicNumber(r, data.female),
        designation: data.designation,
        departmentId: data.dept ? deptByCode[data.dept] : null,
        phone: phoneNumber(r),
        email: data.email ?? `${data.firstName}.${data.lastName}${code}@staff.demo.eduattend.local`.toLowerCase(),
        joiningDate: new Date(Date.UTC(r.int(2012, 2025), r.int(0, 11), r.int(1, 28))),
        userId: data.userId,
      },
    });
    staffByCampus[campus].push(staff.id);
    if (data.teacherOf) {
      const teacher = await db.teacher.create({
        data: {
          organizationId: orgId,
          staffId: staff.id,
          qualification: r.pick(["M.A. English, B.Ed", "M.Sc Mathematics, B.Ed", "M.Sc Physics", "M.Sc Chemistry", "MCS", "M.A. Islamiat", "B.Ed", "M.Ed"]),
          specialization: data.teacherOf.map((c) => SPECIALISTS[c]).join(", "),
        },
      });
      for (const s of data.teacherOf) (teachersBySubject[campus][s] ??= []).push(teacher.id);
    }
    return staff;
  };

  // The demo teacher login is a real Mathematics/Physics teacher at Islamabad.
  await createPerson("isb", { firstName: "Sara", lastName: "Malik", female: true, designation: "Senior Teacher", dept: "SCI", teacherOf: ["MATH", "PHY"], userId: ctx.users.teacher, email: "teacher@demo.eduattend.local" });

  for (const campus of ["isb", "rwp"] as Campus[]) {
    const subjectCodes = [...new Set(academics.sections.filter((s) => s.campusId === ctx.campuses[campus]).flatMap((s) => s.subjectCodes))];
    for (const subj of subjectCodes) {
      const count = ["ENG", "URD", "MATH", "GSCI"].includes(subj) ? (campus === "isb" ? 3 : 2) : 1;
      for (let i = 0; i < count; i++) {
        const female = r.chance(0.65);
        await createPerson(campus, {
          firstName: r.pick(female ? FEMALE_NAMES : MALE_NAMES),
          lastName: r.pick(SURNAMES),
          female,
          designation: i === 0 && count > 1 ? "Senior Teacher" : "Teacher",
          dept: subjectDept[subj],
          teacherOf: [subj],
        });
      }
    }
    const support = [
      { designation: campus === "isb" ? "Vice Principal" : "Campus Head", female: true },
      { designation: "Accounts Officer", female: false },
      { designation: "Admin Officer", female: true },
      { designation: "Receptionist", female: true },
      { designation: "Librarian", female: true },
      { designation: "Lab Assistant", female: false },
      { designation: "IT Support", female: false },
      { designation: "Security Guard", female: false },
      { designation: "Driver", female: false },
    ];
    for (const s of support) {
      await createPerson(campus, { firstName: r.pick(s.female ? FEMALE_NAMES : MALE_NAMES), lastName: r.pick(SURNAMES), female: s.female, designation: s.designation });
    }
  }

  // Teaching assignments: each section-subject gets a teacher of that subject on the same campus.
  const sara = await db.teacher.findFirstOrThrow({ where: { organizationId: orgId, staff: { userId: ctx.users.teacher } } });
  const assignments: { organizationId: string; teacherId: string; sectionId: string; subjectId: string }[] = [];
  const classTeachers: { sectionId: string; staffId: string }[] = [];
  const counter: Record<string, number> = {};
  for (const section of academics.sections) {
    const campus: Campus = section.campusId === ctx.campuses.isb ? "isb" : "rwp";
    for (const code of section.subjectCodes) {
      const pool = teachersBySubject[campus][code] ?? [];
      if (pool.length === 0) continue;
      const key = `${campus}:${code}`;
      let teacherId = pool[(counter[key] = (counter[key] ?? 0) + 1) % pool.length]!;
      // Sara teaches Mathematics to Grade 10 and Physics to Grades 9–10 (all sections) at Islamabad.
      if (campus === "isb" && ((code === "MATH" && section.level === 10) || (code === "PHY" && section.level >= 9))) teacherId = sara.id;
      assignments.push({ organizationId: orgId, teacherId, sectionId: section.id, subjectId: academics.subjects[code]! });
    }
  }
  await db.teacherSubject.createMany({ data: assignments, skipDuplicates: true });

  // Class teachers: the teacher of the most periods in each section.
  const teacherStaff = Object.fromEntries((await db.teacher.findMany({ where: { organizationId: orgId }, select: { id: true, staffId: true } })).map((t) => [t.id, t.staffId]));
  // Sara is reserved as class teacher of Islamabad Grade 10-A only.
  const used = new Set<string>([sara.staffId]);
  for (const section of academics.sections) {
    const candidates = assignments.filter((a) => a.sectionId === section.id).map((a) => teacherStaff[a.teacherId]!).filter((s) => !used.has(s));
    let staffId = candidates[0];
    if (section.campusId === ctx.campuses.isb && section.className === "Grade 10" && section.name === "A") staffId = sara.staffId;
    if (!staffId) continue;
    used.add(staffId);
    classTeachers.push({ sectionId: section.id, staffId });
  }
  for (const ct of classTeachers) await db.section.update({ where: { id: ct.sectionId }, data: { classTeacherId: ct.staffId } });

  // Link the principal and accountant logins to staff records too.
  const vp = await db.staff.findFirst({ where: { organizationId: orgId, designation: "Vice Principal" } });
  if (vp) await db.staff.update({ where: { id: vp.id }, data: { firstName: "Nadia", lastName: "Hussain", designation: "Principal", userId: ctx.users.principal, email: "principal@demo.eduattend.local" } });
  const accounts = await db.staff.findFirst({ where: { organizationId: orgId, designation: "Accounts Officer", campusId: ctx.campuses.isb } });
  if (accounts) await db.staff.update({ where: { id: accounts.id }, data: { firstName: "Bilal", lastName: "Qureshi", userId: ctx.users.accountant, email: "accountant@demo.eduattend.local" } });

  await db.sequence.upsert({
    where: { organizationId_key: { organizationId: orgId, key: "staff.employee" } },
    create: { organizationId: orgId, key: "staff.employee", value: code - 1 },
    update: { value: code - 1 },
  });
  const total = await db.staff.count({ where: { organizationId: orgId } });
  console.log(`• Staff: ${total} employees, ${Object.keys(teacherStaff).length} teachers, ${assignments.length} teaching assignments`);
}

async function seedStudents(ctx: DemoContext, academics: AcademicsSeed) {
  const orgId = ctx.orgId;
  const year = new Date().getFullYear();
  let admission = 1001;
  const studentRows: Prisma.StudentCreateManyInput[] = [];
  const guardianLinks: { studentAdmission: string; guardianKey: string; relation: "FATHER" | "MOTHER"; isPrimary: boolean }[] = [];
  const guardians = new Map<string, { firstName: string; lastName: string; relation: "FATHER" | "MOTHER"; phone: string; cnic: string; email: string | null; occupation: string }>();
  // Families with more than one child share guardians.
  const families: { key: string; surname: string; campus: Campus; area: string }[] = [];

  const newFamily = (campus: Campus) => {
    const surname = r.pick(SURNAMES);
    const key = `fam-${families.length}`;
    const fatherFirst = r.pick(MALE_NAMES);
    guardians.set(`${key}:F`, {
      firstName: fatherFirst,
      lastName: surname,
      relation: "FATHER",
      phone: phoneNumber(r),
      cnic: cnicNumber(r, false),
      email: r.chance(0.55) ? `${fatherFirst}.${surname}${families.length}@parents.demo.eduattend.local`.toLowerCase() : null,
      occupation: r.pick(["Engineer", "Doctor", "Businessman", "Government Officer", "Banker", "Teacher", "Shopkeeper", "Army Officer", "Accountant", "IT Professional"]),
    });
    if (r.chance(0.45)) {
      guardians.set(`${key}:M`, { firstName: r.pick(FEMALE_NAMES), lastName: surname, relation: "MOTHER", phone: phoneNumber(r), cnic: cnicNumber(r, true), email: null, occupation: r.pick(["Homemaker", "Teacher", "Doctor", "Banker"]) });
    }
    const fam = { key, surname, campus, area: r.pick(campus === "isb" ? ISB_AREAS : RWP_AREAS) };
    families.push(fam);
    return fam;
  };

  for (const section of academics.sections) {
    const campus: Campus = section.campusId === ctx.campuses.isb ? "isb" : "rwp";
    const size = r.int(22, 30);
    const isDemoSection = campus === "isb" && section.className === "Grade 10" && section.name === "A";
    const isSiblingSection = campus === "isb" && section.className === "Grade 7" && section.name === "A";
    const entries: { first: string; last: string; female: boolean; fam: (typeof families)[number] }[] = [];
    for (let i = 0; i < size; i++) {
      const female = r.chance(0.48);
      const sameCampus = families.filter((f) => f.campus === campus);
      const fam = sameCampus.length > 20 && r.chance(0.18) ? r.pick(sameCampus) : newFamily(campus);
      entries.push({ first: r.pick(female ? FEMALE_NAMES : MALE_NAMES), last: fam.surname, female, fam });
    }
    // The demo parent's two children.
    if (isDemoSection || isSiblingSection) {
      let fam = families.find((f) => f.key === "fam-demo");
      if (!fam) {
        fam = { key: "fam-demo", surname: "Ali", campus: "isb", area: "G-11/2" };
        families.push(fam);
        guardians.set("fam-demo:F", { firstName: "Tariq", lastName: "Ali", relation: "FATHER", phone: "+92 300 5551234", cnic: "61101-2345678-1", email: "parent@demo.eduattend.local", occupation: "Engineer" });
        guardians.set("fam-demo:M", { firstName: "Rabia", lastName: "Tariq", relation: "MOTHER", phone: "+92 321 5554321", cnic: "61101-8765432-2", email: null, occupation: "Doctor" });
      }
      entries[0] = isDemoSection ? { first: "Muhammad", last: "Ali", female: false, fam } : { first: "Sara", last: "Ali", female: true, fam };
    }
    entries.sort((a, b) => `${a.first} ${a.last}`.localeCompare(`${b.first} ${b.last}`));

    entries.forEach((e, i) => {
      const admissionNo = `STU-${admission++}`;
      const age = section.level + 5;
      studentRows.push({
        organizationId: orgId,
        campusId: section.campusId,
        classId: section.classId,
        sectionId: section.id,
        admissionNo,
        rollNumber: String(i + 1),
        rollOrder: i + 1,
        firstName: e.first,
        lastName: e.last,
        gender: e.female ? "FEMALE" : "MALE",
        dateOfBirth: new Date(Date.UTC(year - age, r.int(0, 11), r.int(1, 28))),
        bFormNumber: cnicNumber(r, e.female),
        address: `House ${r.int(1, 400)}, Street ${r.int(1, 60)}, ${e.fam.area}, ${e.fam.campus === "isb" ? "Islamabad" : "Rawalpindi"}`,
        city: e.fam.campus === "isb" ? "Islamabad" : "Rawalpindi",
        admissionDate: new Date(Date.UTC(year - r.int(0, Math.min(6, section.level)), 7, r.int(1, 20))),
        emergencyContactName: guardians.get(`${e.fam.key}:F`)!.firstName + " " + guardians.get(`${e.fam.key}:F`)!.lastName,
        emergencyContactPhone: guardians.get(`${e.fam.key}:F`)!.phone,
        medicalNotes: r.chance(0.04) ? r.pick(["Asthma — carries an inhaler", "Peanut allergy", "Wears glasses"]) : null,
        email: e.first === "Muhammad" && e.last === "Ali" && isDemoSection ? "student@demo.eduattend.local" : null,
        userId: e.first === "Muhammad" && e.last === "Ali" && isDemoSection ? ctx.users.student : null,
        status: "ACTIVE",
      });
      guardianLinks.push({ studentAdmission: admissionNo, guardianKey: `${e.fam.key}:F`, relation: "FATHER", isPrimary: true });
      if (guardians.has(`${e.fam.key}:M`)) guardianLinks.push({ studentAdmission: admissionNo, guardianKey: `${e.fam.key}:M`, relation: "MOTHER", isPrimary: false });
    });
  }

  await db.student.createMany({ data: studentRows });
  const guardianIds = new Map<string, string>();
  for (const [key, g] of guardians) {
    const created = await db.guardian.create({
      data: {
        organizationId: orgId,
        firstName: g.firstName,
        lastName: g.lastName,
        relation: g.relation,
        phone: g.phone,
        whatsapp: g.phone,
        cnic: g.cnic,
        email: g.email,
        occupation: g.occupation,
        userId: key === "fam-demo:F" ? ctx.users.parent : null,
      },
    });
    guardianIds.set(key, created.id);
  }
  const studentIds = new Map((await db.student.findMany({ where: { organizationId: orgId }, select: { id: true, admissionNo: true } })).map((s) => [s.admissionNo, s.id]));
  await db.studentGuardian.createMany({
    data: guardianLinks.map((l) => ({
      organizationId: orgId,
      studentId: studentIds.get(l.studentAdmission)!,
      guardianId: guardianIds.get(l.guardianKey)!,
      relation: l.relation,
      isPrimary: l.isPrimary,
    })),
    skipDuplicates: true,
  });
  await db.sequence.upsert({
    where: { organizationId_key: { organizationId: orgId, key: "student.admission" } },
    create: { organizationId: orgId, key: "student.admission", value: admission - 1001 },
    update: { value: admission - 1001 },
  });
  console.log(`• Students: ${studentRows.length} students, ${guardians.size} guardians (siblings share parents)`);
}

export async function seedPeople(ctx: DemoContext, academics: AcademicsSeed) {
  if ((await db.staff.count({ where: { organizationId: ctx.orgId } })) === 0) await seedStaff(ctx, academics);
  if ((await db.student.count({ where: { organizationId: ctx.orgId } })) === 0) await seedStudents(ctx, academics);
}
