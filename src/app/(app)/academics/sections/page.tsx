import type { Metadata } from "next";
import { z } from "zod";
import { can, requirePageContext } from "@/server/auth/context";
import { academicLookups, listClasses, listSections } from "@/server/modules/academics/service";
import { pagination } from "@/lib/validation/common";
import { SectionsView } from "./sections-view";

export const metadata: Metadata = { title: "Sections" };

const params = pagination.extend({ classId: z.string().optional().transform((v) => v?.split(",").filter(Boolean)) });

export default async function SectionsPage({ searchParams }: PageProps<"/academics/sections">) {
  const ctx = await requirePageContext("academics.view");
  const query = params.parse(await searchParams);
  const [sections, classes, lookups] = await Promise.all([listSections(ctx, query), listClasses(ctx), academicLookups(ctx)]);
  return (
    <SectionsView
      rows={sections.rows}
      total={sections.total}
      page={query.page}
      pageSize={query.pageSize}
      classes={classes.map((c) => ({ id: c.id, name: c.name, campusId: c.campusId }))}
      lookups={lookups}
      canManage={can(ctx, "academics.manage")}
    />
  );
}
