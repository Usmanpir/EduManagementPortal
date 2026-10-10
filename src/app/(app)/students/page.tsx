import type { Metadata } from "next";
import { can, requirePageContext } from "@/server/auth/context";
import { listStudents } from "@/server/modules/people/students";
import { peopleLookups } from "@/server/modules/people/lookups";
import { studentListQuery } from "@/lib/validation/query";
import { StudentsView } from "./students-view";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage({ searchParams }: PageProps<"/students">) {
  const ctx = await requirePageContext("students.view");
  const query = studentListQuery.parse(await searchParams);
  const [students, lookups] = await Promise.all([listStudents(ctx, query), peopleLookups(ctx)]);
  return (
    <StudentsView
      rows={students.rows}
      total={students.total}
      page={query.page}
      pageSize={query.pageSize}
      lookups={lookups}
      defaultCampusId={ctx.campusId}
      showCampus={!ctx.campusId && lookups.campuses.length > 1}
      perms={{
        create: can(ctx, "students.create"),
        update: can(ctx, "students.update"),
        archive: can(ctx, "students.archive"),
        import: can(ctx, "students.import"),
        export: can(ctx, "students.export"),
      }}
    />
  );
}
