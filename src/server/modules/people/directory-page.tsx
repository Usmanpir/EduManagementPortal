import "server-only";
import { can, requirePageContext } from "@/server/auth/context";
import { StaffDirectory } from "@/components/people/staff-directory";
import { staffListQuery } from "@/lib/validation/query";
import { listStaff } from "./staff";
import { peopleLookups } from "./lookups";

/** Server rendering shared by /teachers and /staff. */
export async function renderStaffDirectory(kind: "teacher" | "staff", searchParams: Record<string, string | string[] | undefined>) {
  const ctx = await requirePageContext(kind === "teacher" ? "teachers.view" : "staff.view");
  const query = staffListQuery.parse(searchParams);
  const [list, lookups] = await Promise.all([listStaff(ctx, { ...query, kind: kind === "teacher" ? "teacher" : "all" }), peopleLookups(ctx)]);
  return (
    <StaffDirectory
      kind={kind}
      rows={list.rows}
      total={list.total}
      page={query.page}
      pageSize={query.pageSize}
      lookups={lookups}
      defaultCampusId={ctx.campusId}
      showCampus={!ctx.campusId && lookups.campuses.length > 1}
      canManage={can(ctx, kind === "teacher" ? "teachers.manage" : "staff.manage")}
      canToggleTeacher={can(ctx, "teachers.manage", "staff.manage")}
      canExport={can(ctx, "reports.export")}
    />
  );
}
