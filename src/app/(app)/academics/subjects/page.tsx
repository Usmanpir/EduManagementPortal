import type { Metadata } from "next";
import { z } from "zod";
import { can, requirePageContext } from "@/server/auth/context";
import { listDepartments, listSubjects } from "@/server/modules/academics/service";
import { SubjectsView } from "./subjects-view";

export const metadata: Metadata = { title: "Subjects" };

const params = z.object({
  q: z.string().max(100).optional(),
  type: z.string().optional().transform((v) => v?.split(",").filter(Boolean)),
});

export default async function SubjectsPage({ searchParams }: PageProps<"/academics/subjects">) {
  const ctx = await requirePageContext("academics.view");
  const query = params.parse(await searchParams);
  const [subjects, departments] = await Promise.all([listSubjects(ctx, query), listDepartments(ctx)]);
  return <SubjectsView subjects={subjects} departments={departments.map((d) => ({ id: d.id, name: d.name }))} canManage={can(ctx, "academics.manage")} />;
}
