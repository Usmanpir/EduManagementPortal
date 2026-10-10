"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, BookOpen, Ellipsis, GraduationCap, Layers, Pencil, Plus } from "lucide-react";
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
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ClassDrawer } from "@/components/academics/class-drawer";
import { SectionDrawer, type SectionFormValue } from "@/components/academics/section-drawer";
import type { AcademicLookups } from "@/components/academics/types";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { api, errorMessage } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { SubjectsTab } from "./subjects-tab";

export type ClassDetail = {
  id: string;
  name: string;
  level: number;
  campusId: string;
  campusName: string;
  departmentId: string | null;
  departmentName: string | null;
  description: string | null;
  sections: (SectionFormValue & {
    students: number;
    classTeacher: string | null;
    roomName: string | null;
    academicYear: string | null;
    assignments: { subjectId: string; teacherId: string }[];
  })[];
  subjects: { id: string; name: string; code: string; color: string | null; periodsPerWeek: number | null }[];
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "subjects", label: "Subjects & teachers" },
];

export function ClassDetailView({
  tab,
  cls,
  allSubjects,
  lookups,
  canManage,
}: {
  tab: string;
  cls: ClassDetail;
  allSubjects: { id: string; name: string; code: string; color: string | null }[];
  lookups: AcademicLookups;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [section, setSection] = useState<{ open: boolean; value: SectionFormValue | null; key: number }>({ open: false, value: null, key: 0 });
  const [archiving, setArchiving] = useState<"class" | { id: string; name: string } | null>(null);
  const students = cls.sections.reduce((n, s) => n + s.students, 0);
  const capacity = cls.sections.reduce((n, s) => n + (s.capacity ?? 0), 0);

  const openSection = (value: SectionFormValue | null) => setSection((s) => ({ open: true, value, key: s.key + 1 }));

  return (
    <div>
      <BreadcrumbLabel segment={cls.id} label={cls.name} />
      <PageHeader
        title={cls.name}
        description={[cls.campusName, cls.departmentName, cls.description].filter(Boolean).join(" · ")}
        actions={
          canManage && (
            <>
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
                  <DropdownMenuItem onSelect={() => openSection(null)}>
                    <Plus /> Add section
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setArchiving("class")}>
                    <Archive /> Archive class
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Students" value={formatNumber(students)} hint={capacity ? `${formatNumber(capacity)} seats` : undefined} icon={GraduationCap} tone="primary" />
        <StatCard label="Sections" value={cls.sections.length} icon={Layers} tone="info" />
        <StatCard label="Subjects" value={cls.subjects.length} icon={BookOpen} tone="success" />
        <StatCard
          label="Teachers assigned"
          value={`${cls.sections.reduce((n, s) => n + s.assignments.length, 0)}/${cls.sections.length * cls.subjects.length}`}
          hint="Subject teachers across sections"
          tone="neutral"
        />
      </div>

      <nav aria-label="Class sections" className="no-scrollbar mb-5 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
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

      {tab === "subjects" ? (
        <SubjectsTab cls={cls} allSubjects={allSubjects} teachers={lookups.staff.filter((s) => s.teacherId && s.campusId === cls.campusId)} canManage={canManage} />
      ) : (
        <section aria-labelledby="sections-heading" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 id="sections-heading" className="text-h2">
              Sections
            </h2>
            {canManage && cls.sections.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => openSection(null)}>
                <Plus /> Add section
              </Button>
            )}
          </div>
          {cls.sections.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No sections yet"
              description="Students are placed in sections. Add at least one — e.g. section A."
              actions={canManage && <Button onClick={() => openSection(null)}><Plus /> Add section</Button>}
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {cls.sections.map((s) => {
                const fill = s.capacity ? Math.min(100, Math.round((s.students / s.capacity) * 100)) : null;
                return (
                  <li key={s.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-h3">
                          {cls.name} — Section {s.name}
                        </p>
                        <p className="text-small text-muted-foreground">{s.classTeacher ?? "No class teacher"}</p>
                      </div>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Actions for section ${s.name}`}>
                              <Ellipsis />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openSection(s)}>
                              <Pencil /> Edit section
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onSelect={() => setArchiving({ id: s.id, name: s.name })}>
                              <Archive /> Archive section
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between text-small">
                        <span className="text-muted-foreground">Students</span>
                        <span className="tabular font-medium">
                          {s.students}
                          {s.capacity ? <span className="text-muted-foreground"> / {s.capacity}</span> : null}
                        </span>
                      </div>
                      {fill !== null && (
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={fill} aria-valuemin={0} aria-valuemax={100} aria-label="Seats filled">
                          <div className={cn("h-full rounded-full", fill >= 100 ? "bg-warning" : "bg-primary")} style={{ width: `${fill}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {s.roomName && <Badge variant="secondary">{s.roomName}</Badge>}
                      {s.academicYear && <Badge variant="outline">{s.academicYear}</Badge>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {editOpen && (
        <ClassDrawer
          open={editOpen}
          onOpenChange={setEditOpen}
          lookups={lookups}
          value={{ id: cls.id, name: cls.name, level: cls.level, campusId: cls.campusId, departmentId: cls.departmentId, description: cls.description }}
          defaultCampusId={cls.campusId}
        />
      )}
      <SectionDrawer
        key={section.key}
        open={section.open}
        onOpenChange={(open) => setSection((s) => ({ ...s, open }))}
        lookups={lookups}
        classes={[{ id: cls.id, name: cls.name, campusId: cls.campusId }]}
        value={section.value}
        defaultClassId={cls.id}
      />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        tone="danger"
        title={archiving === "class" ? `Archive ${cls.name}?` : `Archive section ${archiving?.name ?? ""}?`}
        description="It will be hidden from day-to-day use. Attendance, results and fee history are kept. Classes and sections with active students can't be archived."
        confirmLabel="Archive"
        onConfirm={async () => {
          try {
            if (archiving === "class") {
              const { message } = await api.delete(`/api/classes/${cls.id}`);
              toast.success(message);
              router.push("/academics/classes");
            } else if (archiving) {
              const { message } = await api.delete(`/api/sections/${archiving.id}`);
              toast.success(message);
              router.refresh();
            }
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </div>
  );
}
