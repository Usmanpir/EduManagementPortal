import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { can, type TenantContext } from "@/server/auth/context";
import { accessibleSectionIds } from "@/server/modules/academics/scope";

export type SearchResult = {
  type: "student" | "teacher" | "staff" | "class" | "section" | "invoice" | "guardian";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

function likePattern(q: string) {
  return `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Campus restriction as a SQL fragment for raw queries (column qualified by `alias`). */
function campusSql(ctx: TenantContext, alias: string) {
  const column = Prisma.raw(`${alias}."campusId"`);
  if (ctx.campusId) return Prisma.sql`AND ${column} = ${ctx.campusId}::uuid`;
  if (ctx.allowedCampusIds) return Prisma.sql`AND ${column} = ANY(${ctx.allowedCampusIds}::uuid[])`;
  return Prisma.empty;
}

/**
 * Global search used by the command palette. Uses the trigram expression
 * indexes from the initial migration; every query is pinned to the caller's
 * organization and filtered by their permissions and data scope.
 */
export async function globalSearch(ctx: TenantContext, rawQuery: string, limitPerType = 5): Promise<SearchResult[]> {
  const q = rawQuery.trim().slice(0, 80);
  if (q.length < 2) return [];
  const pattern = likePattern(q);
  const tasks: Promise<SearchResult[]>[] = [];

  if (can(ctx, "students.view")) {
    tasks.push(
      (async () => {
        const sections = await accessibleSectionIds(ctx);
        if (sections && sections.length === 0) return [];
        const sectionFilter = sections ? Prisma.sql`AND s."sectionId" = ANY(${sections}::uuid[])` : Prisma.empty;
        const rows = await db.$queryRaw<{ id: string; firstName: string; lastName: string; admissionNo: string; className: string | null; sectionName: string | null }[]>`
          SELECT s.id, s."firstName", s."lastName", s."admissionNo", c.name AS "className", sec.name AS "sectionName"
          FROM students s
          LEFT JOIN classes c ON c.id = s."classId"
          LEFT JOIN sections sec ON sec.id = s."sectionId"
          WHERE s."organizationId" = ${ctx.orgId}::uuid
            AND s."archivedAt" IS NULL
            AND lower(s."firstName" || ' ' || s."lastName" || ' ' || s."admissionNo") LIKE ${pattern}
            ${campusSql(ctx, "s")}
            ${sectionFilter}
          ORDER BY s."firstName", s."lastName"
          LIMIT ${limitPerType}`;
        return rows.map((r) => ({
          type: "student" as const,
          id: r.id,
          title: `${r.firstName} ${r.lastName}`,
          subtitle: [r.admissionNo, r.className && `${r.className}${r.sectionName ? `-${r.sectionName}` : ""}`].filter(Boolean).join(" · "),
          href: `/students/${r.id}`,
        }));
      })(),
    );
  }

  if (can(ctx, "teachers.view") || can(ctx, "staff.view")) {
    tasks.push(
      (async () => {
        const rows = await db.$queryRaw<{ id: string; firstName: string; lastName: string; employeeCode: string; designation: string; isTeacher: boolean }[]>`
          SELECT st.id, st."firstName", st."lastName", st."employeeCode", st.designation, (t.id IS NOT NULL) AS "isTeacher"
          FROM staff st
          LEFT JOIN teachers t ON t."staffId" = st.id
          WHERE st."organizationId" = ${ctx.orgId}::uuid
            AND st."deletedAt" IS NULL
            AND lower(st."firstName" || ' ' || st."lastName" || ' ' || st."employeeCode") LIKE ${pattern}
            ${campusSql(ctx, "st")}
          ORDER BY st."firstName", st."lastName"
          LIMIT ${limitPerType}`;
        return rows
          .filter((r) => (r.isTeacher ? can(ctx, "teachers.view") : can(ctx, "staff.view")))
          .map((r) => ({
            type: r.isTeacher ? ("teacher" as const) : ("staff" as const),
            id: r.id,
            title: `${r.firstName} ${r.lastName}`,
            subtitle: `${r.employeeCode} · ${r.designation}`,
            href: r.isTeacher ? `/teachers/${r.id}` : `/staff/${r.id}`,
          }));
      })(),
    );
  }

  if (can(ctx, "academics.view")) {
    tasks.push(
      (async () => {
        const sections = await accessibleSectionIds(ctx);
        const classes = await ctx.db.class.findMany({
          where: {
            deletedAt: null,
            name: { contains: q, mode: "insensitive" },
            ...(ctx.campusId ? { campusId: ctx.campusId } : ctx.allowedCampusIds ? { campusId: { in: ctx.allowedCampusIds } } : {}),
            ...(sections ? { sections: { some: { id: { in: sections } } } } : {}),
          },
          select: { id: true, name: true, campus: { select: { name: true } }, _count: { select: { students: { where: { archivedAt: null } } } } },
          take: limitPerType,
          orderBy: { level: "asc" },
        });
        return classes.map((c) => ({
          type: "class" as const,
          id: c.id,
          title: c.name,
          subtitle: `${c._count.students} students · ${c.campus.name}`,
          href: `/academics/classes/${c.id}`,
        }));
      })(),
    );
  }

  if (can(ctx, "invoices.view")) {
    tasks.push(
      (async () => {
        const invoices = await ctx.db.invoice.findMany({
          where: {
            invoiceNo: { contains: q, mode: "insensitive" },
            ...(ctx.campusId ? { campusId: ctx.campusId } : ctx.allowedCampusIds ? { campusId: { in: ctx.allowedCampusIds } } : {}),
          },
          select: { id: true, invoiceNo: true, status: true, student: { select: { firstName: true, lastName: true } } },
          take: limitPerType,
          orderBy: { issueDate: "desc" },
        });
        return invoices.map((i) => ({
          type: "invoice" as const,
          id: i.id,
          title: i.invoiceNo,
          subtitle: `${i.student.firstName} ${i.student.lastName} · ${i.status.toLowerCase()}`,
          href: `/finance/invoices/${i.id}`,
        }));
      })(),
    );
  }

  const results = await Promise.all(tasks);
  return results.flat();
}
