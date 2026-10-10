import { db } from "@/server/db/client";
import type { DemoContext } from "./demo";

export const SUBJECTS = [
  { code: "ENG", name: "English", type: "CORE", color: "#4f46e5", dept: "LANG" },
  { code: "URD", name: "Urdu", type: "CORE", color: "#0891b2", dept: "LANG" },
  { code: "MATH", name: "Mathematics", type: "CORE", color: "#059669", dept: "SCI" },
  { code: "GSCI", name: "General Science", type: "CORE", color: "#d97706", dept: "SCI" },
  { code: "PHY", name: "Physics", type: "CORE", color: "#dc2626", dept: "SCI" },
  { code: "CHEM", name: "Chemistry", type: "CORE", color: "#db2777", dept: "SCI" },
  { code: "BIO", name: "Biology", type: "ELECTIVE", color: "#16a34a", dept: "SCI" },
  { code: "CS", name: "Computer Science", type: "ELECTIVE", color: "#7c3aed", dept: "SCI" },
  { code: "ISL", name: "Islamiat", type: "CORE", color: "#475569", dept: "HUM" },
  { code: "PST", name: "Pakistan Studies", type: "CORE", color: "#0d9488", dept: "HUM" },
  { code: "SST", name: "Social Studies", type: "CORE", color: "#ca8a04", dept: "HUM" },
  { code: "ART", name: "Art & Craft", type: "ACTIVITY", color: "#e11d48", dept: "HUM" },
  { code: "PE", name: "Physical Education", type: "ACTIVITY", color: "#2563eb", dept: "HUM" },
] as const;

/** Which subjects each grade studies (Pakistani curriculum, simplified). */
function subjectsForGrade(level: number): string[] {
  if (level <= 3) return ["ENG", "URD", "MATH", "GSCI", "ISL", "ART", "PE"];
  if (level <= 5) return ["ENG", "URD", "MATH", "GSCI", "ISL", "SST", "ART", "PE"];
  if (level <= 8) return ["ENG", "URD", "MATH", "GSCI", "ISL", "SST", "CS", "PE"];
  return ["ENG", "URD", "MATH", "PHY", "CHEM", "BIO", "CS", "ISL", "PST"];
}

const PERIODS_PER_WEEK: Record<string, number> = { ENG: 6, URD: 5, MATH: 6, GSCI: 4, PHY: 5, CHEM: 5, BIO: 4, CS: 3, ISL: 3, PST: 3, SST: 3, ART: 2, PE: 2 };

export type AcademicsSeed = {
  yearId: string;
  subjects: Record<string, string>;
  /** sections by campus, with their class level and subjects */
  sections: { id: string; campusId: string; classId: string; className: string; name: string; level: number; subjectCodes: string[] }[];
  rooms: Record<string, string[]>;
};

export async function seedAcademics(ctx: DemoContext): Promise<AcademicsSeed> {
  const orgId = ctx.orgId;
  const existingClasses = await db.class.count({ where: { organizationId: orgId } });

  if (existingClasses === 0) {
    const now = new Date();
    const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    await db.academicYear.create({
      data: {
        organizationId: orgId,
        name: `${startYear}–${startYear + 1}`,
        startDate: new Date(`${startYear}-08-01T00:00:00Z`),
        endDate: new Date(`${startYear + 1}-06-30T00:00:00Z`),
        isCurrent: true,
      },
    });

    const depts = [
      { code: "LANG", name: "Languages" },
      { code: "SCI", name: "Science & Mathematics" },
      { code: "HUM", name: "Humanities & Activities" },
      { code: "PRI", name: "Primary School" },
      { code: "SEC", name: "Secondary School" },
    ];
    await db.department.createMany({ data: depts.map((d) => ({ organizationId: orgId, ...d })) });
    const deptIds = Object.fromEntries((await db.department.findMany({ where: { organizationId: orgId } })).map((d) => [d.code, d.id]));

    await db.subject.createMany({
      data: SUBJECTS.map((s) => ({ organizationId: orgId, code: s.code, name: s.name, type: s.type, color: s.color, departmentId: deptIds[s.dept] })),
    });

    const year = await db.academicYear.findFirstOrThrow({ where: { organizationId: orgId, isCurrent: true } });
    const subjectIds = Object.fromEntries((await db.subject.findMany({ where: { organizationId: orgId } })).map((s) => [s.code, s.id]));

    const campusPlan = [
      { campusId: ctx.campuses.isb, maxGrade: 10, prefix: "ISB" },
      { campusId: ctx.campuses.rwp, maxGrade: 8, prefix: "RWP" },
    ];

    for (const plan of campusPlan) {
      // Rooms: classrooms + specialist rooms.
      const roomNames = [
        ...Array.from({ length: plan.maxGrade * 2 + 2 }, (_, i) => `Room ${100 + i + 1}`),
        "Physics Lab",
        "Chemistry Lab",
        "Computer Lab",
        "Library",
        "Main Hall",
      ];
      await db.room.createMany({
        data: roomNames.map((name) => ({
          organizationId: orgId,
          campusId: plan.campusId,
          name,
          capacity: name.startsWith("Room") ? 40 : name === "Main Hall" ? 300 : 35,
          type: name.includes("Lab") ? "LAB" : name === "Library" ? "LIBRARY" : name === "Main Hall" ? "HALL" : "CLASSROOM",
        })),
      });
      const rooms = await db.room.findMany({ where: { campusId: plan.campusId, type: "CLASSROOM" }, orderBy: { name: "asc" } });
      let roomIndex = 0;

      for (let level = 1; level <= plan.maxGrade; level++) {
        const cls = await db.class.create({
          data: {
            organizationId: orgId,
            campusId: plan.campusId,
            name: `Grade ${level}`,
            level,
            departmentId: level <= 5 ? deptIds.PRI : deptIds.SEC,
          },
        });
        const codes = subjectsForGrade(level);
        await db.classSubject.createMany({
          data: codes.map((code) => ({ organizationId: orgId, classId: cls.id, subjectId: subjectIds[code]!, periodsPerWeek: PERIODS_PER_WEEK[code] })),
        });
        const sectionNames = plan.prefix === "ISB" && level >= 9 ? ["A", "B", "C"] : ["A", "B"];
        for (const name of sectionNames) {
          await db.section.create({
            data: {
              organizationId: orgId,
              campusId: plan.campusId,
              classId: cls.id,
              name,
              capacity: 40,
              academicYearId: year.id,
              roomId: rooms[roomIndex++ % rooms.length]?.id ?? null,
            },
          });
        }
      }
    }
    console.log("• Academics: academic year, departments, 13 subjects, 18 classes, rooms");
  }

  const year = await db.academicYear.findFirstOrThrow({ where: { organizationId: orgId, isCurrent: true } });
  const subjects = Object.fromEntries((await db.subject.findMany({ where: { organizationId: orgId } })).map((s) => [s.code, s.id]));
  const subjectCodeById = Object.fromEntries(Object.entries(subjects).map(([code, id]) => [id, code]));
  const sections = await db.section.findMany({
    where: { organizationId: orgId, deletedAt: null },
    include: { class: { include: { subjects: true } } },
    orderBy: [{ class: { level: "asc" } }, { name: "asc" }],
  });
  const rooms = await db.room.findMany({ where: { organizationId: orgId } });

  return {
    yearId: year.id,
    subjects,
    sections: sections.map((s) => ({
      id: s.id,
      campusId: s.campusId,
      classId: s.classId,
      className: s.class.name,
      name: s.name,
      level: s.class.level,
      subjectCodes: s.class.subjects.map((cs) => subjectCodeById[cs.subjectId]!).filter(Boolean),
    })),
    rooms: rooms.reduce<Record<string, string[]>>((acc, r) => {
      (acc[r.campusId] ??= []).push(r.id);
      return acc;
    }, {}),
  };
}
