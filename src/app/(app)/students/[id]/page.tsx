import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can, requirePageContext } from "@/server/auth/context";
import { recordActivity } from "@/server/modules/audit/activity";
import { peopleLookups } from "@/server/modules/people/lookups";
import { getStudentProfile } from "@/server/modules/people/students";
import { studentFeePlan } from "@/server/modules/finance/fees";
import { listInvoices } from "@/server/modules/finance/invoices";
import { todayIn, toDateString } from "@/lib/format";
import { StudentProfileView } from "./student-profile-view";

export const metadata: Metadata = { title: "Student" };

export default async function StudentProfilePage({ params, searchParams }: PageProps<"/students/[id]">) {
  const { id } = await params;
  const { tab, edit } = await searchParams;
  const ctx = await requirePageContext("students.view");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const profile = await getStudentProfile(ctx, id);
  if (!profile) notFound();
  const showFees = can(ctx, "fees.view") || can(ctx, "invoices.view");
  const [lookups, activity, feePlan, invoices] = await Promise.all([
    peopleLookups(ctx),
    recordActivity(ctx, "student", id),
    showFees && can(ctx, "fees.view") ? studentFeePlan(ctx, id) : null,
    showFees && can(ctx, "invoices.view") ? listInvoices(ctx, { studentId: id, page: 1, pageSize: 24 }) : null,
  ]);
  const s = profile.student;
  const d = (v: Date | null) => (v ? toDateString(v) : "");

  return (
    <StudentProfileView
      tab={typeof tab === "string" ? tab : "overview"}
      openEdit={edit === "1" && can(ctx, "students.update")}
      timezone={ctx.organization.timezone}
      threshold={ctx.settings.attendance.lowAttendanceThreshold}
      lookups={lookups}
      activity={activity}
      attendance={profile.attendance}
      fees={
        showFees
          ? {
              plan: feePlan,
              invoices: invoices?.rows ?? null,
              currency: ctx.organization.currency,
              today: todayIn(ctx.organization.timezone),
              canManage: can(ctx, "fees.manage"),
              canRecord: can(ctx, "payments.record"),
            }
          : null
      }
      perms={{
        update: can(ctx, "students.update"),
        archive: can(ctx, "students.archive"),
        documents: can(ctx, "documents.view"),
        manageDocuments: can(ctx, "documents.manage"),
        invite: can(ctx, "students.update"),
      }}
      student={{
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        admissionNo: s.admissionNo,
        status: s.status,
        archived: !!s.archivedAt,
        campusName: s.campus.name,
        className: s.class?.name ?? null,
        classId: s.class?.id ?? null,
        sectionName: s.section?.name ?? null,
        classTeacher: s.section?.classTeacher ? `${s.section.classTeacher.firstName} ${s.section.classTeacher.lastName}` : null,
        hasPortal: !!s.userId,
        form: {
          id: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          gender: s.gender,
          dateOfBirth: d(s.dateOfBirth),
          bFormNumber: s.bFormNumber ?? "",
          cnic: s.cnic ?? "",
          bloodGroup: s.bloodGroup ?? "",
          religion: s.religion ?? "",
          nationality: s.nationality ?? "",
          phone: s.phone ?? "",
          email: s.email ?? "",
          address: s.address ?? "",
          city: s.city ?? "",
          campusId: s.campusId,
          sectionId: s.sectionId,
          rollNumber: s.rollNumber ?? "",
          admissionNo: s.admissionNo,
          admissionDate: d(s.admissionDate),
          status: s.status,
          emergencyContactName: s.emergencyContactName ?? "",
          emergencyContactPhone: s.emergencyContactPhone ?? "",
          medicalNotes: s.medicalNotes ?? "",
          notes: s.notes ?? "",
        },
        guardians: s.guardians.map((g) => ({
          id: g.guardian.id,
          firstName: g.guardian.firstName,
          lastName: g.guardian.lastName,
          relation: g.relation,
          phone: g.guardian.phone,
          whatsapp: g.guardian.whatsapp,
          email: g.guardian.email,
          cnic: g.guardian.cnic,
          occupation: g.guardian.occupation,
          isPrimary: g.isPrimary,
          receivesNotifications: g.receivesNotifications,
          hasPortal: !!g.guardian.userId,
        })),
      }}
    />
  );
}
