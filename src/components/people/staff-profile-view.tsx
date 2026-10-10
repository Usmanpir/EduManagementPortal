"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, BookOpen, Ellipsis, KeyRound, Layers, Mail, Pencil, Phone, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { PersonAvatar } from "@/components/common/person-avatar";
import { RelativeTime } from "@/components/common/relative-time";
import { StatCard } from "@/components/common/stat-card";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { ActivityTimeline, type ActivityItem } from "./activity-timeline";
import { InfoList, ProfileCard } from "./info-list";
import { StaffDrawer, type StaffFormValue } from "./staff-drawer";
import { GENDER_LABELS, STAFF_STATUS_BADGE, type PeopleLookups } from "./types";

export type StaffProfile = {
  id: string;
  name: string;
  employeeCode: string;
  designation: string;
  departmentName: string | null;
  campusName: string;
  status: string;
  isTeacher: boolean;
  qualification: string | null;
  specialization: string | null;
  login: { email: string; lastLoginAt: string | null; status: string } | null;
  pendingInvite: boolean;
  assignments: { sectionId: string; classId: string; label: string; subject: string; color: string | null; students: number }[];
  classTeacherOf: { id: string; classId: string; label: string; students: number }[];
  periodsPerWeek: number;
  form: StaffFormValue;
};

type Perms = { manage: boolean; toggleTeacher: boolean; documents: boolean; manageDocuments: boolean };

export function StaffProfileView({ tab, profile, lookups, activity, timezone, perms }: { tab: string; profile: StaffProfile; lookups: PeopleLookups; activity: ActivityItem[]; timezone: string; perms: Perms }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const status = STAFF_STATUS_BADGE[profile.status] ?? STAFF_STATUS_BADGE.ACTIVE!;
  const f = profile.form;
  const base = profile.isTeacher ? "/teachers" : "/staff";
  const tabs = [
    { key: "overview", label: "Overview" },
    ...(perms.documents ? [{ key: "documents", label: "Documents" }] : []),
    { key: "activity", label: "Activity" },
  ];
  const students = new Set(profile.assignments.map((a) => a.sectionId)).size;

  return (
    <div>
      <BreadcrumbLabel segment={profile.id} label={profile.name} />
      <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-start">
        <PersonAvatar name={profile.name} size="2xl" className="shadow-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h1">{profile.name}</h1>
            <Badge variant={status.variant} dot>
              {status.label}
            </Badge>
            {profile.isTeacher && <Badge variant="primary">Teacher</Badge>}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            <span className="font-mono text-small">{profile.employeeCode}</span>
            <span aria-hidden>·</span>
            <span>{profile.designation}</span>
            {profile.departmentName && (
              <>
                <span aria-hidden>·</span>
                <span>{profile.departmentName}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>{profile.campusName}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {f.phone && (
              <Button variant="outline" size="sm" asChild>
                <a href={`tel:${f.phone}`}>
                  <Phone /> {f.phone}
                </a>
              </Button>
            )}
            {f.email && (
              <Button variant="outline" size="sm" asChild>
                <a href={`mailto:${f.email}`}>
                  <Mail /> {f.email}
                </a>
              </Button>
            )}
          </div>
        </div>
        {perms.manage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={() => setArchiving(true)}>
                  <Archive /> Move to former staff
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {profile.isTeacher && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Subjects taught" value={new Set(profile.assignments.map((a) => a.subject)).size} icon={BookOpen} tone="primary" />
          <StatCard label="Sections" value={students} icon={Layers} tone="info" />
          <StatCard label="Class teacher of" value={profile.classTeacherOf.length} hint={profile.classTeacherOf.map((c) => c.label).join(", ") || undefined} icon={UserRound} tone="success" />
          <StatCard label="Periods per week" value={profile.periodsPerWeek} hint={profile.periodsPerWeek ? undefined : "No timetable yet"} tone="neutral" />
        </div>
      )}

      <nav aria-label="Profile sections" className="no-scrollbar mb-5 flex gap-1 overflow-x-auto border-b">
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
          </Link>
        ))}
      </nav>

      {tab === "documents" && perms.documents ? (
        <DocumentsPanel entity={{ entityType: "staff", entityId: profile.id }} canManage={perms.manageDocuments} defaultCategory={profile.isTeacher ? "TEACHER" : "STAFF"} />
      ) : tab === "activity" ? (
        <ProfileCard title="Activity">
          <ActivityTimeline items={activity} timezone={timezone} />
        </ProfileCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-4 xl:col-span-2">
            {profile.isTeacher && (
              <ProfileCard title="Classes & subjects">
                {profile.assignments.length === 0 && profile.classTeacherOf.length === 0 ? (
                  <EmptyState compact icon={BookOpen} title="No classes assigned yet" description="Assign subjects from a class page under Academics → Classes." />
                ) : (
                  <ul className="-my-1 divide-y">
                    {profile.classTeacherOf.map((c) => (
                      <li key={`ct-${c.id}`} className="flex items-center gap-3 py-2.5">
                        <span className="grid size-8 place-items-center rounded-lg bg-success-subtle text-success-foreground">
                          <UserRound className="size-4" />
                        </span>
                        <Link href={`/academics/classes/${c.classId}`} className="flex-1 text-small font-medium hover:underline">
                          Class teacher — {c.label}
                        </Link>
                        <span className="tabular text-small text-muted-foreground">{c.students} students</span>
                      </li>
                    ))}
                    {profile.assignments.map((a) => (
                      <li key={`${a.sectionId}-${a.subject}`} className="flex items-center gap-3 py-2.5">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.color ?? "var(--muted-foreground)" }} aria-hidden />
                        <span className="flex-1 text-small">
                          <span className="font-medium">{a.subject}</span> ·{" "}
                          <Link href={`/academics/classes/${a.classId}?tab=subjects`} className="hover:underline">
                            {a.label}
                          </Link>
                        </span>
                        <span className="tabular text-small text-muted-foreground">{a.students} students</span>
                      </li>
                    ))}
                  </ul>
                )}
              </ProfileCard>
            )}
            <ProfileCard title="Employment">
              <InfoList
                items={[
                  { label: "Employee ID", value: <span className="font-mono">{profile.employeeCode}</span> },
                  { label: "Designation", value: profile.designation },
                  { label: "Department", value: profile.departmentName },
                  { label: "Campus", value: profile.campusName },
                  { label: "Joining date", value: f.joiningDate ? formatDate(f.joiningDate, "long") : null },
                  ...(profile.isTeacher
                    ? [
                        { label: "Qualification", value: profile.qualification },
                        { label: "Specialization", value: profile.specialization },
                      ]
                    : []),
                ]}
              />
            </ProfileCard>
            <ProfileCard title="Personal information">
              <InfoList
                items={[
                  { label: "Gender", value: f.gender ? GENDER_LABELS[f.gender] : null },
                  ...(lookups.identity.staffCnic ? [{ label: "CNIC", value: f.cnic }] : []),
                  { label: "Phone", value: f.phone },
                  { label: "Email", value: f.email },
                  { label: "Address", value: f.address, wide: true },
                ]}
              />
            </ProfileCard>
          </div>
          <div className="flex flex-col gap-4">
            <ProfileCard title="Sign-in">
              {profile.login ? (
                <div className="flex items-start gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-success-subtle text-success-foreground">
                    <KeyRound className="size-4" />
                  </span>
                  <div className="text-small">
                    <p className="font-medium">{profile.login.email}</p>
                    <p className="text-muted-foreground">
                      {profile.login.status === "DISABLED" ? "Sign-in disabled" : profile.login.lastLoginAt ? <>Last active <RelativeTime date={profile.login.lastLoginAt} /></> : "Hasn't signed in yet"}
                    </p>
                  </div>
                </div>
              ) : profile.pendingInvite ? (
                <p className="text-small text-muted-foreground">Invitation sent — waiting for {profile.name.split(" ")[0]} to accept.</p>
              ) : (
                <p className="text-small text-muted-foreground">
                  No sign-in yet. {perms.manage ? "Edit their profile with an email and choose “Invite to sign in”." : ""}
                </p>
              )}
            </ProfileCard>
            <ProfileCard title="Timeline">
              <ActivityTimeline items={activity.slice(0, 5)} timezone={timezone} />
            </ProfileCard>
          </div>
        </div>
      )}

      {editOpen && (
        <StaffDrawer open={editOpen} onOpenChange={setEditOpen} lookups={lookups} value={f} defaultCampusId={f.campusId} kind={profile.isTeacher ? "teacher" : "staff"} canToggleTeacher={perms.toggleTeacher} />
      )}
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        tone="danger"
        title={`Move ${profile.name} to former staff?`}
        description="They'll be removed from class and subject assignments and their sign-in will be disabled. Attendance, leave and history are kept."
        confirmLabel="Move to former staff"
        onConfirm={async () => {
          try {
            toast.success((await api.delete(`/api/staff/${profile.id}`)).message);
            router.push(base);
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </div>
  );
}
