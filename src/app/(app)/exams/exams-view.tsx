"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useWatch } from "react-hook-form";
import { CalendarDays, ClipboardList, FileSpreadsheet, GraduationCap, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/common/empty-state";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { useApiForm } from "@/components/common/use-api-form";
import { EXAM_TYPE_LABELS, ExamPhaseBadge } from "@/components/exams/exam-ui";
import { useHotkey } from "@/components/shell/shell-context";
import { api } from "@/lib/api-client";
import { addDays, formatDate } from "@/lib/format";
import { EXAM_TYPES, createExamSchema } from "@/lib/validation/exams";
import { FormDatePicker } from "@/components/common/date-pickers";

type Exam = {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  phase: string;
  campusName: string | null;
  classes: number;
  papers: number;
  progress: number;
  results: number;
};
type Option = { value: string; label: string };
export type ExamLookups = { campuses: Option[]; classes: (Option & { campusId: string; subjects: number })[]; rooms: (Option & { campusId: string })[]; subjects: Option[] };

function CreateExamDrawer({ open, onOpenChange, lookups, today, passPercentage }: { open: boolean; onOpenChange: (o: boolean) => void; lookups: ExamLookups; today: string; passPercentage: number }) {
  const router = useRouter();
  const { form, onSubmit, formError, submitting } = useApiForm({
    schema: createExamSchema,
    defaultValues: { name: "", type: "MIDTERM", startDate: addDays(today, 14), endDate: addDays(today, 21), campusId: null, description: "", classIds: [], maxMarks: 100, passMarks: passPercentage },
    submit: async (v) => {
      const res = await api.post<{ id: string }>("/api/exams", v);
      router.push(`/exams/${res.data.id}`);
      return res;
    },
    onSuccess: () => onOpenChange(false),
    refresh: false,
  });
  const { register, control, setValue, formState: { errors } } = form;
  const campusId = useWatch({ control, name: "campusId" });
  const classIds = useWatch({ control, name: "classIds" }) ?? [];
  const classes = campusId ? lookups.classes.filter((c) => c.campusId === campusId) : lookups.classes;
  const papers = classes.filter((c) => classIds.includes(c.value)).reduce((n, c) => n + c.subjects, 0);

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="New exam" description="A paper is created for every subject each class studies. You can adjust dates and marks on the date sheet next." formId="exam-form" submitLabel="Create exam" submitting={submitting} size="lg">
      <form id="exam-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormAlert>{formError}</FormAlert>
        <FieldRow>
          <Field label="Name" htmlFor="name" error={errors.name?.message} required>
            <Input placeholder="e.g. Mid-term examination 2026" {...register("name")} />
          </Field>
          <Field label="Type" htmlFor="type">
            <Controller control={control} name="type" render={({ field }) => <OptionSelect id="type" value={field.value} onChange={(v) => field.onChange(v ?? "OTHER")} options={EXAM_TYPES.map((t) => ({ value: t, label: EXAM_TYPE_LABELS[t]! }))} />} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Starts" htmlFor="startDate" error={errors.startDate?.message} required>
            <FormDatePicker control={control} name="startDate" />
          </Field>
          <Field label="Ends" htmlFor="endDate" error={errors.endDate?.message} required>
            <FormDatePicker control={control} name="endDate" />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Total marks per paper" htmlFor="maxMarks" error={errors.maxMarks?.message}>
            <Input type="number" min={1} className="tabular" {...register("maxMarks")} />
          </Field>
          <Field label="Pass marks per paper" htmlFor="passMarks" error={errors.passMarks?.message}>
            <Input type="number" min={0} className="tabular" {...register("passMarks")} />
          </Field>
        </FieldRow>
        {lookups.campuses.length > 1 && (
          <Field label="Campus" htmlFor="campusId" hint="Leave empty for an exam across all campuses.">
            <Controller
              control={control}
              name="campusId"
              render={({ field }) => (
                <OptionSelect
                  id="campusId"
                  value={field.value ?? null}
                  onChange={(v) => {
                    field.onChange(v);
                    setValue("classIds", []);
                  }}
                  options={lookups.campuses}
                  noneLabel="All campuses"
                />
              )}
            />
          </Field>
        )}
        <fieldset>
          <div className="mb-2 flex items-center justify-between">
            <legend className="text-small font-medium">
              Classes <span className="text-danger">*</span>
            </legend>
            <Button type="button" variant="link" size="sm" onClick={() => setValue("classIds", classIds.length === classes.length ? [] : classes.map((c) => c.value), { shouldValidate: true })}>
              {classIds.length === classes.length ? "Clear" : "Select all"}
            </Button>
          </div>
          <div className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-3">
            {classes.map((c) => (
              <label key={c.value} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-small hover:bg-muted/50">
                <Checkbox
                  checked={classIds.includes(c.value)}
                  onCheckedChange={(v) => setValue("classIds", v === true ? [...classIds, c.value] : classIds.filter((x) => x !== c.value), { shouldValidate: true })}
                />
                <span className="truncate">{c.label}</span>
              </label>
            ))}
          </div>
          {errors.classIds && <p className="mt-1 text-caption text-danger-foreground">{errors.classIds.message}</p>}
          {classIds.length > 0 && <p className="mt-1.5 text-caption text-muted-foreground">{papers} papers will be created across {classIds.length} classes.</p>}
        </fieldset>
      </form>
    </FormDrawer>
  );
}

const GROUPS = [
  { key: "active", title: "Upcoming & in progress", phases: ["SCHEDULED", "ONGOING"] },
  { key: "marking", title: "Marking", phases: ["COMPLETED"] },
  { key: "draft", title: "Drafts", phases: ["DRAFT"] },
  { key: "published", title: "Results published", phases: ["PUBLISHED"] },
];

export function ExamsView({ exams, lookups, today, passPercentage, perms }: { exams: Exam[]; lookups: ExamLookups | null; today: string; passPercentage: number; perms: { manage: boolean; marks: boolean; results: boolean } }) {
  const [drawer, setDrawer] = useState({ open: false, key: 0 });
  const open = () => setDrawer((d) => ({ open: true, key: d.key + 1 }));
  useHotkey("n", open, perms.manage);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Exams"
        description="Plan exams, publish date sheets, collect marks and publish results."
        actions={
          <>
            {perms.marks && (
              <Button variant="outline" asChild>
                <Link href="/exams/marks">
                  <ClipboardList /> Enter marks
                </Link>
              </Button>
            )}
            {perms.results && (
              <Button variant="outline" asChild>
                <Link href="/exams/results">
                  <FileSpreadsheet /> Results
                </Link>
              </Button>
            )}
            {perms.manage && (
              <Button onClick={open}>
                <Plus /> New exam
              </Button>
            )}
          </>
        }
      />
      {exams.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No exams yet" description="Create an exam to build its date sheet, collect marks from teachers and publish report cards." actions={perms.manage && <Button onClick={open}><Plus /> New exam</Button>} />
      ) : (
        GROUPS.map((g) => {
          const items = exams.filter((e) => g.phases.includes(e.phase));
          if (!items.length) return null;
          return (
            <section key={g.key} aria-labelledby={`g-${g.key}`}>
              <SectionHeader title={<span id={`g-${g.key}`}>{g.title}</span>} />
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((e) => (
                  <li key={e.id}>
                    <Link href={`/exams/${e.id}`} className="group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-[border-color,box-shadow] outline-none hover:border-border-strong hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium group-hover:text-primary">{e.name}</p>
                          <p className="text-caption text-muted-foreground">
                            {EXAM_TYPE_LABELS[e.type]}
                            {e.campusName ? ` · ${e.campusName}` : ""}
                          </p>
                        </div>
                        <ExamPhaseBadge phase={e.phase} />
                      </div>
                      <p className="flex items-center gap-1.5 text-small text-muted-foreground">
                        <CalendarDays className="size-4" />
                        {formatDate(e.startDate)} – {formatDate(e.endDate)}
                      </p>
                      <div className="mt-auto">
                        <div className="mb-1 flex justify-between text-caption text-muted-foreground">
                          <span>
                            {e.classes} classes · {e.papers} papers
                          </span>
                          <span className="tabular">{e.progress}% marked</span>
                        </div>
                        <Progress value={e.progress} aria-label={`${e.name}: ${e.progress}% of marks entered`} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
      {perms.manage && lookups && <CreateExamDrawer key={drawer.key} open={drawer.open} onOpenChange={(o) => setDrawer((d) => ({ ...d, open: o }))} lookups={lookups} today={today} passPercentage={passPercentage} />}
    </div>
  );
}
