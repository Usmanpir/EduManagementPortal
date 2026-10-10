"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  BellOff,
  CalendarCheck2,
  CalendarX2,
  Clock3,
  Ellipsis,
  KeyRound,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { PersonAvatar } from "@/components/common/person-avatar";
import { StatCard } from "@/components/common/stat-card";
import { useApiForm } from "@/components/common/use-api-form";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { StudentFeesPanel, type StudentFeesData } from "@/components/finance/student-fees-panel";
import { ActivityTimeline, type ActivityItem } from "@/components/people/activity-timeline";
import { GuardianFields } from "@/components/people/guardian-fields";
import { InfoList, ProfileCard } from "@/components/people/info-list";
import { StudentDrawer, type StudentFormValue } from "@/components/people/student-drawer";
import { GENDER_LABELS, RELATION_LABELS, STUDENT_STATUS_BADGE, type PeopleLookups } from "@/components/people/types";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate, formatPercent } from "@/lib/format";
import { guardianInputSchema } from "@/lib/validation/people";
import { useWatch } from "react-hook-form";

type Guardian = {
  id: string;
  firstName: string;
  lastName: string;
  relation: "FATHER" | "MOTHER" | "GUARDIAN" | "SIBLING" | "OTHER";
  phone: string;
  whatsapp: string | null;
  email: string | null;
  cnic: string | null;
  occupation: string | null;
  isPrimary: boolean;
  receivesNotifications: boolean;
  hasPortal: boolean;
};

type Student = {
  id: string;
  name: string;
  admissionNo: string;
  status: string;
  archived: boolean;
  campusName: string;
  className: string | null;
  classId: string | null;
  sectionName: string | null;
  classTeacher: string | null;
  hasPortal: boolean;
  form: StudentFormValue;
  guardians: Guardian[];
};

type Attendance = {
  counts: { present: number; absent: number; late: number; leave: number };
  rate: number | null;
  recent: { date: string; status: string; note: string | null }[];
};

type Perms = { update: boolean; archive: boolean; documents: boolean; manageDocuments: boolean; invite: boolean };

const STATUS_DOT: Record<string, string> = {
  PRESENT: "bg-success",
  ABSENT: "bg-danger",
  LATE: "bg-warning",
  LEAVE: "bg-info",
};

function RecentAttendance({ recent }: { recent: Attendance["recent"] }) {
  if (recent.length === 0) return <EmptyState compact icon={CalendarCheck2} title="No attendance yet" description="Marked attendance will show here day by day." />;
  const days = [...recent].reverse();
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-1.5" aria-label="Last school days">
        {days.map((d, i) => (
          <li key={`${d.date}-${i}`} title={`${formatDate(d.date, "long")}: ${d.status.toLowerCase()}${d.note ? ` — ${d.note}` : ""}`}>
            <span className={cn("block size-5 rounded-[5px]", STATUS_DOT[d.status] ?? "bg-muted")} />
            <span className="sr-only">
              {formatDate(d.date)}: {d.status.toLowerCase()}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground" aria-hidden>
        {Object.entries(STATUS_DOT).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-[3px]", c)} />
            {k.charAt(0) + k.slice(1).toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

function GuardianDrawer({ open, onOpenChange, studentId, value, showCnic }: { open: boolean; onOpenChange: (o: boolean) => void; studentId: string; value: Guardian | null; showCnic: boolean }) {
  const { form, onSubmit, formError, submitting } = useApiForm({
    schema: guardianInputSchema,
    defaultValues: value
      ? { ...value, id: null, whatsapp: value.whatsapp ?? "", email: value.email ?? "", cnic: value.cnic ?? "", occupation: value.occupation ?? "" }
      : { id: null, firstName: "", lastName: "", relation: "MOTHER", phone: "", whatsapp: "", email: "", cnic: "", occupation: "", isPrimary: false, receivesNotifications: true },
    submit: (v) => (value ? api.patch(`/api/students/${studentId}/guardians/${value.id}`, v) : api.post(`/api/students/${studentId}/guardians`, v)),
    onSuccess: () => onOpenChange(false),
  });
  const [linkedId, phone] = useWatch({ control: form.control, name: ["id", "phone"] });
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={value ? `Edit ${value.firstName} ${value.lastName}` : "Add guardian"} formId="guardian-form" submitLabel={value ? "Save changes" : "Add guardian"} submitting={submitting}>
      <form id="guardian-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormAlert>{formError}</FormAlert>
        <GuardianFields
          prefix=""
          register={form.register}
          control={form.control}
          setValue={form.setValue}
          errors={form.formState.errors}
          showCnic={showCnic}
          linkedId={linkedId}
          phone={phone}
          suggestExisting={!value}
        />
      </form>
    </FormDrawer>
  );
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "parents", label: "Parents" },
  { key: "fees", label: "Fees" },
  { key: "documents", label: "Documents" },
  { key: "activity", label: "Activity" },
];

export function StudentProfileView({
  tab,
  openEdit,
  timezone,
  threshold,
  lookups,
  activity,
  attendance,
  fees,
  perms,
  student,
}: {
  tab: string;
  openEdit: boolean;
  timezone: string;
  threshold: number;
  lookups: PeopleLookups;
  activity: ActivityItem[];
  attendance: Attendance;
  fees: StudentFeesData | null;
  perms: Perms;
  student: Student;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(openEdit);
  const [guardianDrawer, setGuardianDrawer] = useState<{ open: boolean; value: Guardian | null; key: number }>({ open: false, value: null, key: 0 });
  const [confirm, setConfirm] = useState<null | { kind: "archive" | "restore" } | { kind: "remove-guardian"; guardian: Guardian }>(null);
  const status = STUDENT_STATUS_BADGE[student.status] ?? STUDENT_STATUS_BADGE.ACTIVE!;
  const placement = student.className ? `${student.className}${student.sectionName ? ` — ${student.sectionName}` : ""}` : "Not placed in a class";
  const tabs = TABS.filter((t) => (t.key !== "documents" || perms.documents) && (t.key !== "fees" || fees));
  const f = student.form;

  const guardianAction = async (g: Guardian, action: "primary" | "notifications" | "invite") => {
    try {
      if (action === "invite") {
        const { message } = await api.post(`/api/students/${student.id}/guardians/${g.id}`, { action: "invite" });
        toast.success(message);
      } else {
        const body = {
          ...g,
          whatsapp: g.whatsapp ?? "",
          email: g.email ?? "",
          cnic: g.cnic ?? "",
          occupation: g.occupation ?? "",
          isPrimary: action === "primary" ? true : g.isPrimary,
          receivesNotifications: action === "notifications" ? !g.receivesNotifications : g.receivesNotifications,
        };
        await api.patch(`/api/students/${student.id}/guardians/${g.id}`, body);
        toast.success(action === "primary" ? `${g.firstName} is now the primary contact.` : body.receivesNotifications ? "Alerts turned on." : "Alerts turned off.");
      }
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div>
      <BreadcrumbLabel segment={student.id} label={student.name} />

      <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-start">
        <PersonAvatar name={student.name} size="2xl" className="shadow-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h1">{student.name}</h1>
            <Badge variant={status.variant} dot>
              {status.label}
            </Badge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            <span className="font-mono text-small">{student.admissionNo}</span>
            <span aria-hidden>·</span>
            {student.classId ? (
              <Link href={`/academics/classes/${student.classId}`} className="hover:text-foreground hover:underline">
                {placement}
              </Link>
            ) : (
              <span>{placement}</span>
            )}
            {f.rollNumber && (
              <>
                <span aria-hidden>·</span>
                <span>Roll {f.rollNumber}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>{student.campusName}</span>
          </p>
          {student.classTeacher && <p className="mt-1 text-small text-muted-foreground">Class teacher: {student.classTeacher}</p>}
        </div>
        <div className="flex gap-2">
          {perms.update && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
          )}
          {perms.archive && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {student.archived ? (
                  <DropdownMenuItem onSelect={() => setConfirm({ kind: "restore" })}>
                    <RotateCcw /> Restore student
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: "archive" })}>
                    <Archive /> Archive student
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Attendance"
          value={formatPercent(attendance.rate)}
          hint={attendance.rate !== null && attendance.rate < threshold ? `Below the ${threshold}% requirement` : `${attendance.counts.present + attendance.counts.late} days attended`}
          icon={CalendarCheck2}
          tone={attendance.rate === null ? "neutral" : attendance.rate >= threshold ? "success" : "danger"}
        />
        <StatCard label="Absences" value={attendance.counts.absent} icon={CalendarX2} tone="danger" />
        <StatCard label="Late arrivals" value={attendance.counts.late} icon={Clock3} tone="warning" />
        <StatCard label="Guardians" value={student.guardians.length} hint={student.guardians.find((g) => g.isPrimary) ? `Primary: ${student.guardians.find((g) => g.isPrimary)!.firstName}` : "No primary contact"} icon={Users} tone="info" />
      </div>

      <nav aria-label="Student profile" className="no-scrollbar mb-5 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`?tab=${t.key}`}
            scroll={false}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-small font-medium whitespace-nowrap transition-colors",
              tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.key === "parents" && <span className="ms-1.5 text-caption text-muted-foreground">{student.guardians.length}</span>}
          </Link>
        ))}
      </nav>

      {tab === "parents" ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-h2">Parents & guardians</h2>
            {perms.update && (
              <Button variant="outline" onClick={() => setGuardianDrawer((d) => ({ open: true, value: null, key: d.key + 1 }))}>
                <Plus /> Add guardian
              </Button>
            )}
          </div>
          {student.guardians.length === 0 ? (
            <EmptyState icon={Users} title="No guardians yet" description="Add a parent or guardian so they receive absence and fee alerts." />
          ) : (
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {student.guardians.map((g) => (
                <li key={g.id} className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs">
                  <div className="flex items-start gap-3">
                    <PersonAvatar name={`${g.firstName} ${g.lastName}`} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {g.firstName} {g.lastName}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant="secondary">{RELATION_LABELS[g.relation]}</Badge>
                        {g.isPrimary && <Badge variant="primary">Primary contact</Badge>}
                        {g.hasPortal && <Badge variant="success">Portal access</Badge>}
                        {!g.receivesNotifications && (
                          <Badge variant="neutral">
                            <BellOff /> Alerts off
                          </Badge>
                        )}
                      </div>
                    </div>
                    {perms.update && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${g.firstName}`}>
                            <Ellipsis />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setGuardianDrawer((d) => ({ open: true, value: g, key: d.key + 1 }))}>
                            <Pencil /> Edit details
                          </DropdownMenuItem>
                          {!g.isPrimary && (
                            <DropdownMenuItem onSelect={() => guardianAction(g, "primary")}>
                              <Star /> Make primary contact
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => guardianAction(g, "notifications")}>
                            <BellOff /> {g.receivesNotifications ? "Turn off alerts" : "Turn on alerts"}
                          </DropdownMenuItem>
                          {perms.invite && !g.hasPortal && (
                            <DropdownMenuItem onSelect={() => guardianAction(g, "invite")} disabled={!g.email}>
                              <KeyRound /> {g.email ? "Invite to parent portal" : "Add email to invite"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: "remove-guardian", guardian: g })}>
                            <Trash2 /> Remove from student
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`tel:${g.phone}`}>
                        <Phone /> {g.phone}
                      </a>
                    </Button>
                    {(g.whatsapp || g.phone) && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`https://wa.me/${(g.whatsapp || g.phone).replace(/[^\d]/g, "")}`} target="_blank" rel="noopener noreferrer">
                          <MessageCircle /> WhatsApp
                        </a>
                      </Button>
                    )}
                    {g.email && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`mailto:${g.email}`}>
                          <Mail /> Email
                        </a>
                      </Button>
                    )}
                  </div>
                  {(g.cnic || g.occupation) && (
                    <InfoList
                      items={[
                        { label: "CNIC", value: g.cnic },
                        { label: "Occupation", value: g.occupation },
                      ]}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : tab === "fees" && fees ? (
        <StudentFeesPanel studentId={student.id} studentName={student.name} {...fees} />
      ) : tab === "documents" && perms.documents ? (
        <DocumentsPanel entity={{ entityType: "student", entityId: student.id }} canManage={perms.manageDocuments} defaultCategory="STUDENT" />
      ) : tab === "activity" ? (
        <ProfileCard title="Activity">
          <ActivityTimeline items={activity} timezone={timezone} />
        </ProfileCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-4 xl:col-span-2">
            <ProfileCard title="Personal information">
              <InfoList
                items={[
                  { label: "Full name", value: student.name },
                  { label: "Gender", value: f.gender ? GENDER_LABELS[f.gender] : null },
                  { label: "Date of birth", value: f.dateOfBirth ? formatDate(f.dateOfBirth, "long") : null },
                  ...(lookups.identity.studentBForm ? [{ label: "B-Form", value: f.bFormNumber }] : []),
                  ...(lookups.identity.studentCnic ? [{ label: "CNIC", value: f.cnic }] : []),
                  { label: "Phone", value: f.phone },
                  { label: "Email", value: f.email },
                  { label: "Address", value: [f.address, f.city].filter(Boolean).join(", "), wide: true },
                ]}
              />
            </ProfileCard>
            <ProfileCard title="Academic information">
              <InfoList
                items={[
                  { label: "Admission number", value: <span className="font-mono">{student.admissionNo}</span> },
                  { label: "Admission date", value: f.admissionDate ? formatDate(f.admissionDate, "long") : null },
                  { label: "Class & section", value: student.className ? placement : null },
                  { label: "Roll number", value: f.rollNumber },
                  { label: "Campus", value: student.campusName },
                  { label: "Class teacher", value: student.classTeacher },
                ]}
              />
            </ProfileCard>
            <ProfileCard title="Recent attendance" action={<span className="text-caption text-muted-foreground">Last {attendance.recent.length} records</span>}>
              <RecentAttendance recent={attendance.recent} />
            </ProfileCard>
          </div>
          <div className="flex flex-col gap-4">
            <ProfileCard
              title="Parents"
              action={
                <Link href="?tab=parents" scroll={false} className="text-small font-medium text-primary hover:underline">
                  Manage
                </Link>
              }
            >
              {student.guardians.length === 0 ? (
                <p className="text-small text-muted-foreground">No guardian added yet.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {student.guardians.map((g) => (
                    <li key={g.id} className="flex items-center gap-3">
                      <PersonAvatar name={`${g.firstName} ${g.lastName}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-small font-medium">
                          {g.firstName} {g.lastName}
                        </p>
                        <p className="text-caption text-muted-foreground">
                          {RELATION_LABELS[g.relation]}
                          {g.isPrimary ? " · Primary" : ""}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon-sm" asChild>
                        <a href={`tel:${g.phone}`} aria-label={`Call ${g.firstName}`}>
                          <Phone />
                        </a>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </ProfileCard>
            <ProfileCard title="Emergency & medical">
              <InfoList
                className="sm:grid-cols-1"
                items={[
                  { label: "Emergency contact", value: f.emergencyContactName ? `${f.emergencyContactName}${f.emergencyContactPhone ? ` · ${f.emergencyContactPhone}` : ""}` : null },
                  { label: "Medical notes", value: f.medicalNotes },
                ]}
              />
            </ProfileCard>
            <ProfileCard title="Timeline">
              <ActivityTimeline items={activity.slice(0, 5)} timezone={timezone} />
            </ProfileCard>
          </div>
        </div>
      )}

      {editOpen && <StudentDrawer open={editOpen} onOpenChange={setEditOpen} lookups={lookups} value={f} defaultCampusId={f.campusId} />}
      <GuardianDrawer
        key={guardianDrawer.key}
        open={guardianDrawer.open}
        onOpenChange={(o) => setGuardianDrawer((d) => ({ ...d, open: o }))}
        studentId={student.id}
        value={guardianDrawer.value}
        showCnic={lookups.identity.guardianCnic}
      />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        tone={confirm?.kind === "restore" ? "default" : "danger"}
        title={
          confirm?.kind === "archive"
            ? `Archive ${student.name}?`
            : confirm?.kind === "restore"
              ? `Restore ${student.name}?`
              : `Remove ${confirm?.kind === "remove-guardian" ? confirm.guardian.firstName : ""} from ${student.name}?`
        }
        description={
          confirm?.kind === "archive"
            ? "This will remove the student from active records but preserve historical data."
            : confirm?.kind === "restore"
              ? "They'll return to active lists and attendance registers."
              : "They'll stop receiving alerts about this student. Their record stays linked to any siblings."
        }
        confirmLabel={confirm?.kind === "archive" ? "Archive student" : confirm?.kind === "restore" ? "Restore" : "Remove guardian"}
        onConfirm={async () => {
          try {
            if (confirm?.kind === "archive") toast.success((await api.delete(`/api/students/${student.id}`, {})).message);
            else if (confirm?.kind === "restore") toast.success((await api.post(`/api/students/${student.id}/restore`)).message);
            else if (confirm?.kind === "remove-guardian") toast.success((await api.delete(`/api/students/${student.id}/guardians/${confirm.guardian.id}`)).message);
            router.refresh();
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </div>
  );
}
