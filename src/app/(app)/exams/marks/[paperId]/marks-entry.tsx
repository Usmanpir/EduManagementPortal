"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Keyboard, Lock, Save } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormAlert } from "@/components/common/form-alert";
import { PageHeader } from "@/components/common/page-header";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { getMarksSheet } from "@/server/modules/exams/marks";

type Sheet = Awaited<ReturnType<typeof getMarksSheet>>;
type Entry = { value: string; absent: boolean; remarks: string };

const fromServer = (s: Sheet["students"][number]): Entry => ({ value: s.marks === null ? "" : String(s.marks), absent: s.absent, remarks: s.remarks ?? "" });
const same = (a: Entry, b: Entry) => a.value.trim() === b.value.trim() && a.absent === b.absent && a.remarks.trim() === b.remarks.trim();

export function MarksEntry({ sheet }: { sheet: Sheet }) {
  const router = useRouter();
  const { paper, students } = sheet;
  const initial = useMemo(() => Object.fromEntries(students.map((s) => [s.id, fromServer(s)])), [students]);
  const [entries, setEntries] = useState<Record<string, Entry>>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const locked = paper.published;

  const dirtyIds = students.filter((s) => !same(entries[s.id]!, initial[s.id]!)).map((s) => s.id);
  const dirty = dirtyIds.length > 0;

  const invalid = (e: Entry) => {
    if (e.absent || e.value.trim() === "") return null;
    const n = Number(e.value);
    if (!Number.isFinite(n) || n < 0) return "Not a number";
    if (n > paper.maxMarks) return `Max ${paper.maxMarks}`;
    return null;
  };

  const stats = (() => {
    const vals = students.map((s) => entries[s.id]!).filter((e) => !e.absent && e.value.trim() !== "" && !invalid(e)).map((e) => Number(e.value));
    const absent = students.filter((s) => entries[s.id]!.absent).length;
    return {
      entered: vals.length + absent,
      absent,
      pass: vals.filter((v) => v >= paper.passMarks).length,
      average: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      highest: vals.length ? Math.max(...vals) : null,
    };
  })();

  const set = (id: string, patch: Partial<Entry>) => {
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));
    setFieldErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };
  const focus = (i: number) => {
    const el = inputs.current[Math.max(0, Math.min(students.length - 1, i))];
    el?.focus();
    el?.select();
  };

  const save = async () => {
    if (!dirty || saving || locked) return;
    const bad = dirtyIds.find((id) => invalid(entries[id]!));
    if (bad) {
      focus(students.findIndex((s) => s.id === bad));
      toast.error(`Check the highlighted marks (max ${paper.maxMarks}).`);
      return;
    }
    setSaving(true);
    const changed = dirtyIds.map((id) => ({ studentId: id, marks: entries[id]!.absent ? null : entries[id]!.value.trim() === "" ? null : Number(entries[id]!.value), absent: entries[id]!.absent, remarks: entries[id]!.remarks }));
    try {
      const { message } = await api.put("/api/marks", { examSubjectId: paper.id, sectionId: paper.sectionId, marks: changed });
      toast.success(message);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.fields)) {
          const i = Number(k.split(".")[1]);
          if (changed[i]) mapped[changed[i].studentId] = v;
        }
        setFieldErrors(mapped);
      }
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Ctrl/Cmd+S saves; leaving with unsaved marks asks first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  });

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number, id: string) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      focus(i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key.toLowerCase() === "a" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      set(id, { absent: !entries[id]!.absent, value: "" });
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-20 md:pb-0">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ms-2 mb-1">
          <Link href="/exams/marks">
            <ArrowLeft className="rtl:rotate-180" /> All papers
          </Link>
        </Button>
        <PageHeader
          title={`${paper.subject} · ${paper.className}-${paper.sectionName}`}
          description={`${paper.examName}${paper.date ? ` · ${formatDate(paper.date, "weekday")}` : ""} · out of ${paper.maxMarks}, pass ${paper.passMarks}`}
        />
      </div>

      {locked ? (
        <FormAlert variant="info">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-4" /> Results for this exam are published, so marks are read-only.
          </span>
        </FormAlert>
      ) : (
        <p className="hidden items-center gap-2 text-caption text-muted-foreground sm:flex">
          <Keyboard className="size-4" /> Type a mark and press <kbd className="rounded border px-1">Enter</kbd> for the next student · <kbd className="rounded border px-1">A</kbd> marks absent · <kbd className="rounded border px-1">Ctrl</kbd>+<kbd className="rounded border px-1">S</kbd> saves
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Entered", `${stats.entered}/${students.length}`],
          ["Passed", stats.entered ? `${stats.pass}` : "—"],
          ["Average", stats.average === null ? "—" : stats.average.toFixed(1)],
          ["Highest", stats.highest ?? "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-card px-4 py-3 shadow-xs">
            <dt className="text-caption text-muted-foreground">{k}</dt>
            <dd className="tabular text-h3">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <table className="w-full text-small">
          <thead className="bg-muted/50">
            <tr className="border-b text-caption text-muted-foreground">
              <th scope="col" className="h-9 w-14 px-3 text-start font-medium">Roll</th>
              <th scope="col" className="h-9 px-3 text-start font-medium">Student</th>
              <th scope="col" className="h-9 w-32 px-3 text-start font-medium">Marks</th>
              <th scope="col" className="h-9 w-24 px-3 text-center font-medium">Absent</th>
              <th scope="col" className="hidden h-9 px-3 text-start font-medium md:table-cell">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => {
              const e = entries[s.id]!;
              const err = fieldErrors[s.id] ?? invalid(e);
              const n = e.value.trim() === "" ? null : Number(e.value);
              const failing = !e.absent && n !== null && !err && n < paper.passMarks;
              const changed = !same(e, initial[s.id]!);
              return (
                <tr key={s.id} className={cn("border-b last:border-0", changed && "bg-primary-subtle/30")}>
                  <td className="px-3 py-1.5 tabular text-muted-foreground">{s.rollNumber ?? "—"}</td>
                  <td className="px-3 py-1.5">
                    <label htmlFor={`m-${s.id}`} className="font-medium">
                      {s.name}
                    </label>
                  </td>
                  <td className="px-3 py-1.5">
                    <Input
                      id={`m-${s.id}`}
                      ref={(el) => {
                        inputs.current[i] = el;
                      }}
                      inputMode="decimal"
                      autoComplete="off"
                      disabled={locked}
                      value={e.absent ? "ABS" : e.value}
                      readOnly={e.absent}
                      onFocus={(ev) => ev.currentTarget.select()}
                      onChange={(ev) => set(s.id, { value: ev.target.value.replace(/[^\d.]/g, "") })}
                      onKeyDown={(ev) => onKeyDown(ev, i, s.id)}
                      aria-invalid={!!err || undefined}
                      aria-describedby={err ? `err-${s.id}` : undefined}
                      className={cn("h-8 w-24 tabular", e.absent && "text-warning-foreground", failing && "text-danger-foreground")}
                    />
                    {err && (
                      <span id={`err-${s.id}`} className="block text-caption text-danger-foreground">
                        {err}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--warning)]"
                      aria-label={`${s.name} absent`}
                      disabled={locked}
                      checked={e.absent}
                      onChange={(ev) => set(s.id, { absent: ev.target.checked, value: "" })}
                    />
                  </td>
                  <td className="hidden px-3 py-1.5 md:table-cell">
                    <Input aria-label={`Remarks for ${s.name}`} disabled={locked} value={e.remarks} maxLength={120} onChange={(ev) => set(s.id, { remarks: ev.target.value })} className="h-8" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!locked && (
        <div className="fixed inset-x-0 bottom-14 z-(--z-sticky) border-t bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md md:sticky md:bottom-4 md:rounded-xl md:border md:shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <p className="text-small text-muted-foreground" aria-live="polite">
              {dirty ? `${dirtyIds.length} unsaved change${dirtyIds.length === 1 ? "" : "s"}` : "All changes saved"}
            </p>
            <Button onClick={save} disabled={!dirty || saving}>
              <Save /> {saving ? "Saving…" : "Save marks"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
