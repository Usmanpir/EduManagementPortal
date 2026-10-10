"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck, Calculator, CalendarDays, ClipboardList, Ellipsis, Eye, EyeOff, FileSpreadsheet, Pencil, Plus, Printer, Trash2, Undo2 } from "lucide-react";
import { Controller } from "react-hook-form";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { PageHeader } from "@/components/common/page-header";
import { useApiForm } from "@/components/common/use-api-form";
import { EXAM_TYPE_LABELS, ExamPhaseBadge } from "@/components/exams/exam-ui";
import { useUrlState } from "@/components/data/use-url-state";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { EXAM_TYPES, examSchema } from "@/lib/validation/exams";
import type { getExam } from "@/server/modules/exams/service";
import type { ExamLookups } from "../exams-view";
import { DatePicker, FormDatePicker, TimePicker } from "@/components/common/date-pickers";

type Exam = Awaited<ReturnType<typeof getExam>>;
type ExamClass = Exam["classes"][number];
type Row = { subjectId: string; subject: string; date: string; start: string; end: string; roomId: string | null; maxMarks: string; passMarks: string; marksEntered: number };

function ScheduleDrawer({ exam, cls, lookups, onOpenChange }: { exam: Exam; cls: ExamClass; lookups: ExamLookups; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(
    cls.papers.map((p) => ({ subjectId: p.subjectId, subject: p.subject, date: p.date ?? "", start: p.start ?? "", end: p.end ?? "", roomId: p.roomId, maxMarks: String(p.maxMarks), passMarks: String(p.passMarks), marksEntered: p.marksEntered })),
  );
  const [adding, setAdding] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const campusId = lookups.classes.find((c) => c.value === cls.id)?.campusId;
  const rooms = lookups.rooms.filter((r) => r.campusId === campusId);
  const available = lookups.subjects.filter((s) => !rows.some((r) => r.subjectId === s.value));
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setError(null);
    try {
      const { message } = await api.put(`/api/exams/${exam.id}/schedule`, { classId: cls.id, subjects: rows.map((r) => ({ subjectId: r.subjectId, date: r.date, start: r.start, end: r.end, roomId: r.roomId, maxMarks: r.maxMarks, passMarks: r.passMarks })) });
      toast.success(message);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDrawer open onOpenChange={onOpenChange} title={`Date sheet · ${cls.name}`} description={`Papers between ${formatDate(exam.startDate)} and ${formatDate(exam.endDate)}.`} formId="schedule-form" submitting={saving} size="lg">
      <form id="schedule-form" onSubmit={submit} noValidate className="flex flex-col gap-3">
        <FormAlert>{error}</FormAlert>
        {rows.map((r, i) => (
          <fieldset key={r.subjectId} className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <legend className="font-medium">{r.subject}</legend>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${r.subject}`} disabled={r.marksEntered > 0} title={r.marksEntered ? "Has marks" : undefined} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              <Field label="Date" htmlFor={`d${i}`} error={errors[`subjects.${i}.date`]} className="col-span-2">
                <DatePicker id={`d${i}`} min={exam.startDate} max={exam.endDate} value={r.date} onChange={(v) => update(i, { date: v })} />
              </Field>
              <Field label="Start" htmlFor={`s${i}`}>
                <TimePicker id={`s${i}`} value={r.start} onChange={(v) => update(i, { start: v })} />
              </Field>
              <Field label="End" htmlFor={`e${i}`} error={errors[`subjects.${i}.end`]}>
                <TimePicker id={`e${i}`} value={r.end} onChange={(v) => update(i, { end: v })} />
              </Field>
              <Field label="Total" htmlFor={`m${i}`} error={errors[`subjects.${i}.maxMarks`]}>
                <Input id={`m${i}`} type="number" min={1} className="tabular" value={r.maxMarks} onChange={(e) => update(i, { maxMarks: e.target.value })} />
              </Field>
              <Field label="Pass" htmlFor={`p${i}`} error={errors[`subjects.${i}.passMarks`]}>
                <Input id={`p${i}`} type="number" min={0} className="tabular" value={r.passMarks} onChange={(e) => update(i, { passMarks: e.target.value })} />
              </Field>
              {rooms.length > 0 && (
                <Field label="Room" htmlFor={`r${i}`} className="col-span-2 sm:col-span-6">
                  <OptionSelect id={`r${i}`} value={r.roomId} onChange={(v) => update(i, { roomId: v })} options={rooms} noneLabel="Own classroom" />
                </Field>
              )}
            </div>
          </fieldset>
        ))}
        {available.length > 0 && (
          <div className="flex items-end gap-2">
            <Field label="Add a paper" htmlFor="add-subject" className="flex-1">
              <OptionSelect id="add-subject" value={adding} onChange={setAdding} options={available} />
            </Field>
            <Button
              type="button"
              variant="outline"
              disabled={!adding}
              onClick={() => {
                const s = available.find((x) => x.value === adding)!;
                const last = rows[rows.length - 1];
                setRows((rs) => [...rs, { subjectId: s.value, subject: s.label, date: "", start: last?.start ?? "", end: last?.end ?? "", roomId: null, maxMarks: last?.maxMarks ?? "100", passMarks: last?.passMarks ?? "40", marksEntered: 0 }]);
                setAdding(null);
              }}
            >
              <Plus /> Add
            </Button>
          </div>
        )}
      </form>
    </FormDrawer>
  );
}

function EditExamDrawer({ exam, onOpenChange }: { exam: Exam; onOpenChange: (o: boolean) => void }) {
  const { form, onSubmit, formError, submitting } = useApiForm({
    schema: examSchema,
    defaultValues: { name: exam.name, type: exam.type as (typeof EXAM_TYPES)[number], startDate: exam.startDate, endDate: exam.endDate, campusId: exam.campusId, description: exam.description ?? "" },
    submit: (v) => api.patch(`/api/exams/${exam.id}`, v),
    onSuccess: () => onOpenChange(false),
  });
  const { register, control, formState: { errors } } = form;
  return (
    <FormDrawer open onOpenChange={onOpenChange} title="Edit exam" formId="edit-exam" submitting={submitting}>
      <form id="edit-exam" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormAlert>{formError}</FormAlert>
        <Field label="Name" htmlFor="name" error={errors.name?.message} required>
          <Input {...register("name")} />
        </Field>
        <Field label="Type" htmlFor="type">
          <Controller control={control} name="type" render={({ field }) => <OptionSelect id="type" value={field.value} onChange={(v) => field.onChange(v ?? "OTHER")} options={EXAM_TYPES.map((t) => ({ value: t, label: EXAM_TYPE_LABELS[t]! }))} />} />
        </Field>
        <FieldRow>
          <Field label="Starts" htmlFor="startDate" error={errors.startDate?.message}>
            <FormDatePicker control={control} name="startDate" />
          </Field>
          <Field label="Ends" htmlFor="endDate" error={errors.endDate?.message}>
            <FormDatePicker control={control} name="endDate" />
          </Field>
        </FieldRow>
        <Field label="Notes" htmlFor="description">
          <Input {...register("description")} placeholder="Optional, shown on the date sheet" />
        </Field>
      </form>
    </FormDrawer>
  );
}

export function ExamDetail({ exam, lookups, activeClassId, perms }: { exam: Exam; lookups: ExamLookups | null; activeClassId: string | null; perms: { manage: boolean; marks: boolean; publish: boolean; results: boolean } }) {
  const router = useRouter();
  const { set } = useUrlState();
  const [editing, setEditing] = useState<"exam" | "schedule" | null>(null);
  const [confirm, setConfirm] = useState<null | "publish" | "unpublish" | "delete">(null);
  const [notify, setNotify] = useState(true);
  const published = exam.status === "PUBLISHED";
  const cls = exam.classes.find((c) => c.id === activeClassId) ?? null;
  const totalPapers = exam.classes.reduce((n, c) => n + c.papers.length, 0);
  const marksEntered = exam.classes.reduce((n, c) => n + c.papers.reduce((m, p) => m + p.marksEntered, 0), 0);
  const expected = exam.classes.reduce((n, c) => n + c.students * c.papers.length, 0);
  const unscheduled = exam.classes.reduce((n, c) => n + c.papers.filter((p) => !p.date).length, 0);

  const act = async (fn: () => Promise<{ message: string }>) => {
    try {
      toast.success((await fn()).message);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={<ExamPhaseBadge phase={exam.phase} />}
        title={exam.name}
        description={`${EXAM_TYPE_LABELS[exam.type]} · ${formatDate(exam.startDate, "long")} – ${formatDate(exam.endDate, "long")}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/exams/print/date-sheet?exam=${exam.id}`} target="_blank" rel="noreferrer">
                <Printer /> Date sheet
              </a>
            </Button>
            {perms.results && (
              <Button variant="outline" asChild>
                <Link href={`/exams/results?exam=${exam.id}`}>
                  <FileSpreadsheet /> Results
                </Link>
              </Button>
            )}
            {perms.publish &&
              (published ? (
                <Button variant="outline" onClick={() => setConfirm("unpublish")}>
                  <EyeOff /> Unpublish results
                </Button>
              ) : marksEntered > 0 ? (
                <Button onClick={() => setConfirm("publish")}>
                  <Eye /> Publish results
                </Button>
              ) : null)}
            {(perms.manage || perms.publish) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More actions">
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {perms.publish && !published && (
                    <DropdownMenuItem onSelect={() => act(() => api.post(`/api/exams/${exam.id}/results`))}>
                      <Calculator /> Compute results now
                    </DropdownMenuItem>
                  )}
                  {perms.manage && !published && exam.status === "DRAFT" && (
                    <DropdownMenuItem onSelect={() => act(() => api.post(`/api/exams/${exam.id}/status`, { status: "SCHEDULED" }))}>
                      <CalendarCheck /> Publish date sheet
                    </DropdownMenuItem>
                  )}
                  {perms.manage && !published && exam.status === "SCHEDULED" && (
                    <DropdownMenuItem onSelect={() => act(() => api.post(`/api/exams/${exam.id}/status`, { status: "DRAFT" }))}>
                      <Undo2 /> Back to draft
                    </DropdownMenuItem>
                  )}
                  {perms.manage && lookups && (
                    <DropdownMenuItem onSelect={() => setEditing("exam")}>
                      <Pencil /> Edit details
                    </DropdownMenuItem>
                  )}
                  {perms.manage && marksEntered === 0 && !published && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
                        <Trash2 /> Delete exam
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      {exam.status === "DRAFT" && perms.manage && (
        <FormAlert variant="info">
          This exam is a draft. Set paper dates, then choose <strong>Publish date sheet</strong> from the menu so teachers and families can see it.
          {unscheduled > 0 && ` ${unscheduled} papers still need a date.`}
        </FormAlert>
      )}
      {published && <FormAlert variant="success">Results are published. Marks are locked; unpublish to make corrections.</FormAlert>}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Classes", exam.classes.length],
          ["Papers", totalPapers],
          ["Not yet dated", unscheduled],
          ["Marks entered", expected ? `${Math.min(100, Math.round((marksEntered / expected) * 100))}%` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-card p-4 shadow-xs">
            <dt className="text-small text-muted-foreground">{k}</dt>
            <dd className="tabular text-h2">{v}</dd>
          </div>
        ))}
      </dl>

      {exam.classes.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No papers" description="This exam has no classes. Delete it and create a new one with classes selected." />
      ) : (
        <section className="rounded-xl border bg-card shadow-xs">
          <div role="tablist" aria-label="Class" className="no-scrollbar flex gap-1 overflow-x-auto border-b px-3 pt-2">
            {exam.classes.map((c) => (
              <button
                key={c.id}
                role="tab"
                type="button"
                aria-selected={c.id === cls?.id}
                onClick={() => set({ class: c.id })}
                className={cn("-mb-px shrink-0 border-b-2 px-3 py-2 text-small font-medium whitespace-nowrap", c.id === cls?.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
              >
                {c.name}
              </button>
            ))}
          </div>
          {cls && (
            <div className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-small text-muted-foreground">
                  {cls.students} students · sections {cls.sections.map((s) => s.name).join(", ") || "—"}
                </p>
                {perms.manage && lookups && !published && (
                  <Button size="sm" variant="outline" onClick={() => setEditing("schedule")}>
                    <Pencil /> Edit date sheet
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-small">
                  <thead>
                    <tr className="border-b text-caption text-muted-foreground">
                      <th className="py-2 pe-3 text-start font-medium">Subject</th>
                      <th className="py-2 pe-3 text-start font-medium">Date</th>
                      <th className="py-2 pe-3 text-start font-medium">Time</th>
                      <th className="py-2 pe-3 text-start font-medium">Room</th>
                      <th className="py-2 pe-3 text-end font-medium">Total / pass</th>
                      <th className="py-2 pe-3 text-end font-medium">Marked</th>
                      {perms.marks && !published && <th className="py-2 text-end font-medium"><span className="sr-only">Enter marks</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {cls.papers.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2.5 pe-3">
                          <span className="inline-flex items-center gap-2 font-medium">
                            <span className="size-2.5 rounded-full" style={{ background: p.color ?? "var(--chart-1)" }} aria-hidden />
                            {p.subject}
                          </span>
                        </td>
                        <td className="py-2.5 pe-3 whitespace-nowrap">{p.date ? formatDate(p.date, "weekday") : <span className="text-warning-foreground">Not set</span>}</td>
                        <td className="py-2.5 pe-3 whitespace-nowrap text-muted-foreground">{p.start ? `${p.start}${p.end ? `–${p.end}` : ""}` : "—"}</td>
                        <td className="py-2.5 pe-3 text-muted-foreground">{p.room ?? "Classroom"}</td>
                        <td className="py-2.5 pe-3 text-end tabular">
                          {p.maxMarks} / {p.passMarks}
                        </td>
                        <td className="py-2.5 pe-3 text-end tabular text-muted-foreground">
                          {p.marksEntered}/{cls.students}
                        </td>
                        {perms.marks && !published && (
                          <td className="py-2.5 text-end">
                            <div className="flex justify-end gap-1">
                              {cls.sections.map((s) => (
                                <Button key={s.id} size="sm" variant="ghost" asChild>
                                  <Link href={`/exams/marks/${p.id}?section=${s.id}`} aria-label={`Enter ${p.subject} marks for section ${s.name}`}>
                                    <ClipboardList /> {s.name}
                                  </Link>
                                </Button>
                              ))}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {editing === "schedule" && cls && lookups && <ScheduleDrawer exam={exam} cls={cls} lookups={lookups} onOpenChange={(o) => !o && setEditing(null)} />}
      {editing === "exam" && lookups && <EditExamDrawer exam={exam} onOpenChange={(o) => !o && setEditing(null)} />}
      <ConfirmDialog
        open={confirm === "publish"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Publish ${exam.name} results?`}
        description="Results are recomputed from the marks entered, then shown to students and parents. Marks are locked until you unpublish."
        confirmLabel="Publish results"
        onConfirm={async () => {
          await act(() => api.post(`/api/exams/${exam.id}/publish`, { publish: true, notify }));
          setConfirm(null);
        }}
      >
        {expected > marksEntered && <FormAlert variant="info">{expected - marksEntered} marks are still missing. Those students will show as incomplete.</FormAlert>}
        <label className="mt-2 flex items-center gap-2 text-small">
          <Checkbox checked={notify} onCheckedChange={(v) => setNotify(v === true)} /> Notify parents and students
        </label>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "unpublish"}
        onOpenChange={(o) => !o && setConfirm(null)}
        tone="danger"
        title="Unpublish results?"
        description="Students and parents will no longer see these results, and teachers can correct marks again."
        confirmLabel="Unpublish"
        onConfirm={async () => {
          await act(() => api.post(`/api/exams/${exam.id}/publish`, { publish: false }));
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        tone="danger"
        title={`Delete ${exam.name}?`}
        description="The exam and its date sheet will be removed. This can't be undone."
        confirmLabel="Delete exam"
        onConfirm={async () => {
          try {
            const { message } = await api.delete(`/api/exams/${exam.id}`);
            toast.success(message);
            router.push("/exams");
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}
