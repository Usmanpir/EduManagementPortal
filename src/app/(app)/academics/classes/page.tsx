import type { Metadata } from "next";
import { can, requirePageContext } from "@/server/auth/context";
import { academicLookups, listClasses } from "@/server/modules/academics/service";
import { ClassesView } from "./classes-view";

export const metadata: Metadata = { title: "Classes" };

export default async function ClassesPage({ searchParams }: PageProps<"/academics/classes">) {
  const ctx = await requirePageContext("academics.view");
  const { q } = await searchParams;
  const [classes, lookups] = await Promise.all([listClasses(ctx, { q: typeof q === "string" ? q : undefined }), academicLookups(ctx)]);
  return (
    <ClassesView
      classes={classes}
      lookups={lookups}
      canManage={can(ctx, "academics.manage")}
      defaultCampusId={ctx.campusId}
      showCampus={!ctx.campusId && lookups.campuses.length > 1}
    />
  );
}
