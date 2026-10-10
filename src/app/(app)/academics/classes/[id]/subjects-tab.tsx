"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/common/combobox";
import { EmptyState } from "@/components/common/empty-state";
import { FormDrawer } from "@/components/common/form-drawer";
import { api, errorMessage } from "@/lib/api-client";
import type { ClassDetail } from "./class-detail-view";

type Teacher = { id: string; name: string; teacherId: string | null; designation: string };
const NONE = "__none__";

function SubjectPicker({
  open,
  onOpenChange,
  cls,
  allSubjects,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cls: ClassDetail;
  allSubjects: { id: string; name: string; code: string; color: string | null }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Map<string, string>>(
    () => new Map(cls.subjects.map((s) => [s.id, s.periodsPerWeek != null ? String(s.periodsPerWeek) : ""])),
  );
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { message } = await api.put(`/api/classes/${cls.id}/subjects`, {
        subjects: [...selected.entries()].map(([subjectId, periods]) => ({ subjectId, periodsPerWeek: periods === "" ? null : Number(periods) })),
      });
      toast.success(message);
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Subjects for ${cls.name}`}
      description="Choose what this class studies. Periods per week help when building the timetable."
      formId="class-subjects-form"
      submitLabel="Save subjects"
      submitting={saving}
    >
      <form id="class-subjects-form" onSubmit={save}>
        <ul className="divide-y rounded-lg border">
          {allSubjects.map((s) => {
            const checked = selected.has(s.id);
            return (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                <Checkbox
                  id={`sub-${s.id}`}
                  checked={checked}
                  onCheckedChange={(v) =>
                    setSelected((prev) => {
                      const next = new Map(prev);
                      if (v === true) next.set(s.id, "");
                      else next.delete(s.id);
                      return next;
                    })
                  }
                />
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color ?? "var(--muted-foreground)" }} aria-hidden />
                <label htmlFor={`sub-${s.id}`} className="flex-1 text-small">
                  <span className="font-medium">{s.name}</span> <span className="text-muted-foreground">{s.code}</span>
                </label>
                {checked && (
                  <Input
                    aria-label={`Periods per week for ${s.name}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={40}
                    placeholder="/wk"
                    value={selected.get(s.id) ?? ""}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Map(prev);
                        next.set(s.id, e.target.value);
                        return next;
                      })
                    }
                    className="h-8 w-20"
                  />
                )}
              </li>
            );
          })}
        </ul>
      </form>
    </FormDrawer>
  );
}

function TeacherCell({ sectionId, subjectId, value, teachers, canManage }: { sectionId: string; subjectId: string; value: string | null; teachers: Teacher[]; canManage: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [saving, setSaving] = useState(false);
  const name = teachers.find((t) => t.teacherId === current)?.name;

  if (!canManage) return <span className={current ? "" : "text-muted-foreground"}>{name ?? "Not assigned"}</span>;

  return (
    <Combobox
      value={current ?? NONE}
      disabled={saving}
      onChange={async (v) => {
        const teacherId = v === NONE ? null : v;
        const previous = current;
        setCurrent(teacherId);
        setSaving(true);
        try {
          await api.put(`/api/sections/${sectionId}/teachers`, { subjectId, teacherId });
          router.refresh();
        } catch (error) {
          setCurrent(previous);
          toast.error(errorMessage(error));
        } finally {
          setSaving(false);
        }
      }}
      options={[{ value: NONE, label: "Not assigned" }, ...teachers.map((t) => ({ value: t.teacherId!, label: t.name, hint: t.designation }))]}
      placeholder="Assign teacher"
      searchPlaceholder="Search teachers…"
      className="h-8 min-w-40"
    />
  );
}

export function SubjectsTab({
  cls,
  allSubjects,
  teachers,
  canManage,
}: {
  cls: ClassDetail;
  allSubjects: { id: string; name: string; code: string; color: string | null }[];
  teachers: Teacher[];
  canManage: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const assignment = (sectionId: string, subjectId: string) =>
    cls.sections.find((s) => s.id === sectionId)?.assignments.find((a) => a.subjectId === subjectId)?.teacherId ?? null;

  if (allSubjects.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Create subjects first"
        description="Add the subjects your institution teaches, then choose which ones this class studies."
        actions={
          <Button asChild>
            <Link href="/academics/subjects?new=1">Add subjects</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-h2">Subjects & teachers</h2>
          <p className="text-small text-muted-foreground">
            {teachers.length === 0 ? "Add teachers on this campus to assign them here." : "Pick who teaches each subject in each section. Changes save instantly."}
          </p>
        </div>
        {canManage && (
          <Button variant="outline" onClick={() => setPickerOpen(true)}>
            <Pencil /> Choose subjects
          </Button>
        )}
      </div>

      {cls.subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={`No subjects chosen for ${cls.name}`}
          description="Choose the subjects this class studies."
          actions={canManage && <Button onClick={() => setPickerOpen(true)}>Choose subjects</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full text-small">
            <thead className="bg-muted/60">
              <tr className="border-b">
                <th scope="col" className="h-10 px-4 text-start text-caption font-medium text-muted-foreground">
                  Subject
                </th>
                {cls.sections.map((s) => (
                  <th key={s.id} scope="col" className="h-10 min-w-48 px-4 text-start text-caption font-medium text-muted-foreground">
                    Section {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cls.subjects.map((sub) => (
                <tr key={sub.id} className="border-b last:border-0">
                  <th scope="row" className="px-4 py-2.5 text-start font-normal">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: sub.color ?? "var(--muted-foreground)" }} aria-hidden />
                      <span className="font-medium">{sub.name}</span>
                      {sub.periodsPerWeek != null && <span className="text-caption text-muted-foreground">{sub.periodsPerWeek}/wk</span>}
                    </span>
                  </th>
                  {cls.sections.map((sec) => (
                    <td key={sec.id} className="px-4 py-2">
                      <TeacherCell sectionId={sec.id} subjectId={sub.id} value={assignment(sec.id, sub.id)} teachers={teachers} canManage={canManage} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pickerOpen && <SubjectPicker open={pickerOpen} onOpenChange={setPickerOpen} cls={cls} allSubjects={allSubjects} />}
    </div>
  );
}
