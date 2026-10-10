"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, GraduationCap, Layers, Library, Plus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { ClassDrawer } from "@/components/academics/class-drawer";
import type { AcademicLookups } from "@/components/academics/types";
import { FilterBar } from "@/components/data/filter-bar";
import { useHotkey } from "@/components/shell/shell-context";
import { formatNumber } from "@/lib/format";

type ClassRow = {
  id: string;
  name: string;
  campusName: string;
  departmentName: string | null;
  students: number;
  subjects: number;
  sections: { id: string; name: string; students: number; capacity: number | null; classTeacher: string | null }[];
};

function ClassCard({ cls, showCampus }: { cls: ClassRow; showCampus: boolean }) {
  const teachers = [...new Set(cls.sections.map((s) => s.classTeacher).filter(Boolean))] as string[];
  const meta = [showCampus ? cls.campusName : null, cls.departmentName].filter(Boolean).join(" · ");
  return (
    <Link
      href={`/academics/classes/${cls.id}`}
      className="group flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs transition-[border-color,box-shadow] outline-none hover:border-border-strong hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-h2 group-hover:text-primary">{cls.name}</h3>
          {meta && <p className="truncate text-small text-muted-foreground">{meta}</p>}
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary-subtle-foreground">
          <Library className="size-4" />
        </span>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-small">
        {[
          { label: "Students", value: cls.students, icon: GraduationCap },
          { label: "Sections", value: cls.sections.length, icon: Layers },
          { label: "Subjects", value: cls.subjects, icon: BookOpen },
        ].map((s) => (
          <div key={s.label} className="flex flex-col">
            <dt className="flex items-center gap-1 text-caption text-muted-foreground">
              <s.icon className="size-3.5" /> {s.label}
            </dt>
            <dd className="tabular text-h3">{formatNumber(s.value)}</dd>
          </div>
        ))}
      </dl>

      {cls.sections.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {cls.sections.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 text-caption">
              <span className="font-semibold">{s.name}</span>
              <span className="tabular text-muted-foreground">
                {s.students}
                {s.capacity ? `/${s.capacity}` : ""}
              </span>
            </span>
          ))}
        </div>
      )}

      <p className="mt-auto flex items-center gap-1.5 border-t pt-3 text-caption text-muted-foreground">
        <UserRound className="size-3.5 shrink-0" />
        <span className="truncate">{teachers.length ? teachers.join(", ") : "No class teacher assigned"}</span>
      </p>
    </Link>
  );
}

export function ClassesView({
  classes,
  lookups,
  canManage,
  defaultCampusId,
  showCampus,
}: {
  classes: ClassRow[];
  lookups: AcademicLookups;
  canManage: boolean;
  defaultCampusId: string | null;
  showCampus: boolean;
}) {
  const searchParams = useSearchParams();
  const [drawer, setDrawer] = useState({ open: canManage && searchParams.get("new") === "1", key: 0 });
  const openNew = () => setDrawer((d) => ({ open: true, key: d.key + 1 }));
  useHotkey("n", openNew, canManage);
  const filtered = !!searchParams.get("q");

  return (
    <div>
      <PageHeader
        title="Classes"
        description="Grades, their sections and the subjects taught in each."
        actions={
          canManage && (
            <Button onClick={openNew}>
              <Plus /> Add class
            </Button>
          )
        }
      />
      {(classes.length > 0 || filtered) && <FilterBar searchPlaceholder="Search classes" />}

      {classes.length === 0 ? (
        filtered ? (
          <EmptyState icon={Library} title="No classes match your search" description="Try a different name." />
        ) : (
          <EmptyState
            icon={Library}
            title="No classes yet"
            description="Create your first class — for example Grade 1 with sections A and B. Students and attendance are organized by class and section."
            actions={
              canManage && (
                <Button onClick={openNew}>
                  <Plus /> Add class
                </Button>
              )
            }
          />
        )
      ) : showCampus ? (
        // Organization-wide view: one group per campus so grades don't interleave.
        <div className="flex flex-col gap-8">
          {lookups.campuses.map((c) => c.name).filter((name) => classes.some((c) => c.campusName === name)).map((campus) => {
            const group = classes.filter((c) => c.campusName === campus);
            return (
              <section key={campus} aria-label={campus}>
                <h2 className="mb-3 flex items-baseline gap-2 text-h2">
                  {campus}
                  <span className="text-small font-normal text-muted-foreground">
                    {group.length} classes · {formatNumber(group.reduce((n, c) => n + c.students, 0))} students
                  </span>
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {group.map((c) => (
                    <ClassCard key={c.id} cls={c} showCampus={false} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {classes.map((c) => (
            <ClassCard key={c.id} cls={c} showCampus={false} />
          ))}
        </div>
      )}

      <ClassDrawer
        key={drawer.key}
        open={drawer.open}
        onOpenChange={(open) => setDrawer((d) => ({ ...d, open }))}
        lookups={lookups}
        value={null}
        defaultCampusId={defaultCampusId}
      />
    </div>
  );
}
