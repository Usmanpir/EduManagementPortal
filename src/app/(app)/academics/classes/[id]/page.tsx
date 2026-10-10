import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can, requirePageContext } from "@/server/auth/context";
import { academicLookups, getClass, listSubjects } from "@/server/modules/academics/service";
import { ClassDetailView } from "./class-detail-view";

export const metadata: Metadata = { title: "Class" };

export default async function ClassDetailPage({ params, searchParams }: PageProps<"/academics/classes/[id]">) {
  const { id } = await params;
  const { tab } = await searchParams;
  const ctx = await requirePageContext("academics.view");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const cls = await getClass(ctx, id);
  if (!cls) notFound();

  const [lookups, subjects] = await Promise.all([academicLookups(ctx), listSubjects(ctx)]);

  return (
    <ClassDetailView
      tab={typeof tab === "string" ? tab : "overview"}
      cls={{
        id: cls.id,
        name: cls.name,
        level: cls.level,
        campusId: cls.campus.id,
        campusName: cls.campus.name,
        departmentId: cls.department?.id ?? null,
        departmentName: cls.department?.name ?? null,
        description: cls.description,
        sections: cls.sections.map((s) => ({
          id: s.id,
          classId: cls.id,
          name: s.name,
          capacity: s.capacity,
          students: s._count.students,
          classTeacherId: s.classTeacher?.id ?? null,
          classTeacher: s.classTeacher ? `${s.classTeacher.firstName} ${s.classTeacher.lastName}` : null,
          roomId: s.room?.id ?? null,
          roomName: s.room?.name ?? null,
          academicYearId: s.academicYear?.id ?? null,
          academicYear: s.academicYear?.name ?? null,
          assignments: s.teachingAssignments,
        })),
        subjects: cls.subjects.map((cs) => ({ ...cs.subject, periodsPerWeek: cs.periodsPerWeek })),
      }}
      allSubjects={subjects.map((s) => ({ id: s.id, name: s.name, code: s.code, color: s.color }))}
      lookups={lookups}
      canManage={can(ctx, "academics.manage")}
    />
  );
}
