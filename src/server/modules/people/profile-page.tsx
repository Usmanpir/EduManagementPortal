import "server-only";
import { notFound, redirect } from "next/navigation";
import { can, requirePageContext } from "@/server/auth/context";
import { StaffProfileView } from "@/components/people/staff-profile-view";
import { recordActivity } from "@/server/modules/audit/activity";
import { toDateString } from "@/lib/format";
import { peopleLookups } from "./lookups";
import { getStaffProfile } from "./staff";

/** Server rendering shared by /teachers/[id] and /staff/[id]. */
export async function renderStaffProfile(kind: "teacher" | "staff", id: string, tab: string) {
  const ctx = await requirePageContext(kind === "teacher" ? "teachers.view" : "staff.view");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const result = await getStaffProfile(ctx, id);
  if (!result) notFound();
  const { staff, pendingInvite } = result;
  // Keep URLs canonical: teachers live under /teachers, everyone else under /staff.
  if (kind === "teacher" && !staff.teacher) redirect(`/staff/${id}`);
  if (kind === "staff" && staff.teacher && can(ctx, "teachers.view")) redirect(`/teachers/${id}`);

  const [lookups, activity] = await Promise.all([peopleLookups(ctx), recordActivity(ctx, "staff", id)]);
  const manage = can(ctx, staff.teacher ? "teachers.manage" : "staff.manage");

  return (
    <StaffProfileView
      tab={tab}
      lookups={lookups}
      activity={activity}
      timezone={ctx.organization.timezone}
      perms={{ manage, toggleTeacher: can(ctx, "teachers.manage", "staff.manage"), documents: can(ctx, "documents.view"), manageDocuments: can(ctx, "documents.manage") }}
      profile={{
        id: staff.id,
        name: `${staff.firstName} ${staff.lastName}`,
        employeeCode: staff.employeeCode,
        designation: staff.designation,
        departmentName: staff.department?.name ?? null,
        campusName: staff.campus.name,
        status: staff.status,
        isTeacher: !!staff.teacher,
        qualification: staff.teacher?.qualification ?? null,
        specialization: staff.teacher?.specialization ?? null,
        login: staff.user ? { email: staff.user.email, lastLoginAt: staff.user.lastLoginAt?.toISOString() ?? null, status: staff.user.status } : null,
        pendingInvite: !!pendingInvite,
        periodsPerWeek: staff.teacher?._count.timetableEntries ?? 0,
        assignments: (staff.teacher?.subjects ?? []).map((a) => ({
          sectionId: a.section.id,
          classId: a.section.class.id,
          label: `${a.section.class.name} — ${a.section.name}`,
          subject: a.subject.name,
          color: a.subject.color,
          students: a.section._count.students,
        })),
        classTeacherOf: staff.classTeacherOf.map((c) => ({ id: c.id, classId: c.class.id, label: `${c.class.name} — ${c.name}`, students: c._count.students })),
        form: {
          id: staff.id,
          hasLogin: !!staff.user,
          firstName: staff.firstName,
          lastName: staff.lastName,
          gender: staff.gender,
          dateOfBirth: staff.dateOfBirth ? toDateString(staff.dateOfBirth) : "",
          cnic: staff.cnic ?? "",
          phone: staff.phone ?? "",
          email: staff.email ?? "",
          address: staff.address ?? "",
          campusId: staff.campusId,
          departmentId: staff.departmentId,
          designation: staff.designation,
          employeeCode: staff.employeeCode,
          joiningDate: staff.joiningDate ? toDateString(staff.joiningDate) : "",
          status: staff.status,
          isTeacher: !!staff.teacher,
          qualification: staff.teacher?.qualification ?? "",
          specialization: staff.teacher?.specialization ?? "",
          inviteToSignIn: false,
        },
      }}
    />
  );
}
