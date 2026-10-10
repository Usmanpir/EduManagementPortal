"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCheck, CircleCheck, Clock3, History, Lock, MessageSquareText, RotateCcw, Search, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { PersonAvatar } from "@/components/common/person-avatar";
import { STATUS_META, StatusPicker } from "@/components/attendance/status";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate, formatMinutes } from "@/lib/format";
import type { getRegister } from "@/server/modules/attendance/register";

type Register = Awaited<ReturnType<typeof getRegister>>;
type Status = "PRESENT" | "ABSENT" | "LATE" | "LEAVE";
type Entry = { status: Status | null; note: string | null };
type Filter = "all" | "unmarked" | "absent" | "late";

const STATUSES: Status[] = ["PRESENT", "ABSENT", "LATE", "LEAVE"];

// ── Local draft (survives reloads and flaky connections) ──
const draftListeners = new Set<() => void>();
function readDraft(key: string): Record<string, Entry> | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, Entry>) : null;
  } catch {
    return null;
  }
}
function writeDraft(key: string, value: Record<string, Entry> | null) {
  try {
    if (value) window.localStorage.setItem(key, JSON.stringify(value));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable — drafts are a convenience only.
  }
  draftListeners.forEach((l) => l());
}

function Counter({ label, value, status }: { label: string; value: number; status: Status }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3 py-2">
      <span className={cn("size-2.5 shrink-0 rounded-full", STATUS_META[status].dot)} aria-hidden />
      <span className="truncate text-small text-muted-foreground">{label}</span>
      <span className="ms-auto tabular text-h3">{value}</span>
    </div>
  );
}

export function RegisterView({ register, today }: { register: Register; today: string }) {
  const router = useRouter();
  const slot = register.period?.id ?? "DAY";
  const draftKey = `ea:attendance:${register.section.id}:${register.date}:${slot}`;
  const initial = useMemo(() => Object.fromEntries(register.students.map((s) => [s.id, { status: s.status as Status | null, note: s.note }])), [register.students]);
  const [entries, setEntries] = useState<Record<string, Entry>>(initial);
  const [baseline, setBaseline] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<null | { counts: Record<string, number>; total: number; notified: number }>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [reason, setReason] = useState("");
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  // Adopt fresh server data after a save/refresh.
  const [serverInitial, setServerInitial] = useState(initial);
  if (serverInitial !== initial) {
    setServerInitial(initial);
    setEntries(initial);
    setBaseline(initial);
  }

  const access = register.access;
  const editable = access === "edit" || access === "request-correction";
  const correctionMode = access === "request-correction";

  const dirtyIds = register.students.filter((s) => entries[s.id]?.status !== baseline[s.id]?.status || (entries[s.id]?.note ?? null) !== (baseline[s.id]?.note ?? null)).map((s) => s.id);
  const dirty = dirtyIds.length > 0;

  const storedDraft = useSyncExternalStore(
    (cb) => {
      draftListeners.add(cb);
      return () => draftListeners.delete(cb);
    },
    () => (typeof window === "undefined" ? null : window.localStorage.getItem(draftKey)),
    () => null,
  );
  const draftAvailable = !!storedDraft && !dirty && access === "edit";

  useEffect(() => {
    if (access !== "edit") return;
    writeDraft(draftKey, dirty ? entries : null);
  }, [entries, dirty, draftKey, access]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const counts = useMemo(() => {
    const c = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, unmarked: 0 };
    for (const s of register.students) {
      const st = entries[s.id]?.status;
      if (st) c[st]++;
      else c.unmarked++;
    }
    return c;
  }, [entries, register.students]);
  const total = register.students.length;
  const attended = counts.PRESENT + counts.LATE;
  const rate = attended + counts.ABSENT > 0 ? Math.round((attended / (attended + counts.ABSENT)) * 100) : null;

  const visible = register.students.filter((s) => {
    const st = entries[s.id]?.status ?? null;
    if (filter === "unmarked" && st) return false;
    if (filter === "absent" && st !== "ABSENT") return false;
    if (filter === "late" && st !== "LATE") return false;
    if (query && !`${s.name} ${s.rollNumber ?? ""} ${s.admissionNo}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const setStatus = useCallback(
    (studentId: string, status: Status) => {
      setResult(null);
      setEntries((prev) => ({ ...prev, [studentId]: { status, note: prev[studentId]?.note ?? null } }));
    },
    [],
  );

  const markAllPresent = () => {
    setResult(null);
    setEntries((prev) => {
      const next = { ...prev };
      for (const s of register.students) {
        // Students on approved leave keep their leave status.
        if (s.approvedLeave && next[s.id]?.status === "LEAVE") continue;
        next[s.id] = { status: "PRESENT", note: next[s.id]?.note ?? null };
      }
      return next;
    });
  };

  const focusRow = (index: number) => {
    const s = visible[index];
    if (!s) return;
    const el = rowRefs.current.get(s.id);
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  };

  const onRowKey = (e: React.KeyboardEvent, index: number, studentId: string) => {
    if ((e.target as HTMLElement).closest("input,textarea")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const status = STATUSES.find((st) => STATUS_META[st].key === k);
    if (status && editable) {
      e.preventDefault();
      setStatus(studentId, status);
      focusRow(index + 1);
    } else if (k === "arrowdown" || k === "j") {
      e.preventDefault();
      focusRow(index + 1);
    } else if (k === "arrowup" || k === "k") {
      e.preventDefault();
      focusRow(index - 1);
    }
  };

  const save = async () => {
    if (counts.unmarked > 0) {
      setFilter("unmarked");
      toast.error(`Mark every student first — ${counts.unmarked} still ${counts.unmarked === 1 ? "needs" : "need"} a status.`);
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<{ counts: Record<string, number>; total: number; notified: number }>("/api/attendance/register", {
        sectionId: register.section.id,
        date: register.date,
        periodId: register.period?.id ?? null,
        records: register.students.map((s) => ({ studentId: s.id, status: entries[s.id]!.status, note: entries[s.id]!.note })),
      });
      writeDraft(draftKey, null);
      setBaseline(entries);
      setResult(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.querySelector("[data-scroll-root]")?.scrollTo({ top: 0, behavior: "smooth" });
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error), { action: { label: "Try again", onClick: () => void save() } });
    } finally {
      setSaving(false);
    }
  };

  const submitCorrection = async () => {
    try {
      const { message } = await api.post("/api/attendance/corrections", {
        sectionId: register.section.id,
        date: register.date,
        periodId: register.period?.id ?? null,
        reason,
        changes: dirtyIds.map((id) => ({ studentId: id, status: entries[id]!.status })),
      });
      toast.success(message);
      setEntries(baseline);
      setReason("");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const title = `${register.section.className} — Section ${register.section.name}`;
  const isToday = register.date === today;

  return (
    <div className="pb-28 md:pb-24">
      <BreadcrumbLabel segment={register.section.id} label={`${register.section.className}-${register.section.name}`} />

      <div className="mb-5 flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild className="-ms-2 shrink-0">
          <Link href={`/attendance?date=${register.date}`} aria-label="Back to attendance">
            <ArrowLeft className="rtl:rotate-180" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-h1">{title}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            {register.subject && <span className="font-medium text-foreground">{register.subject}</span>}
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" /> {isToday ? "Today, " : ""}
              {formatDate(register.date, "long")}
            </span>
            {register.period && (
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="size-4" /> {register.period.name} · {formatMinutes(register.period.startMinute)} – {formatMinutes(register.period.endMinute)}
              </span>
            )}
            {register.room && <span>{register.room}</span>}
          </p>
        </div>
      </div>

      {result && (
        <div role="status" className="mb-5 flex animate-pop flex-col gap-3 rounded-xl border border-success/30 bg-success-subtle p-4 text-success-foreground sm:flex-row sm:items-center">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success text-on-success">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="24" className="animate-check" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Attendance saved</p>
            <p className="text-small">
              {result.total} students processed · {result.counts.present} present · {result.counts.absent} absent · {result.counts.late} late · {result.counts.leave} leave
              {result.notified > 0 && ` · parents of ${result.notified} ${result.notified === 1 ? "student" : "students"} notified`}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild className="border-success/30 bg-card">
            <Link href={`/attendance?date=${register.date}`}>Back to classes</Link>
          </Button>
        </div>
      )}

      {access === "future" && <Notice icon={CalendarDays} tone="info">Attendance can be marked on the day. Come back on {formatDate(register.date, "long")}.</Notice>}
      {access === "locked" && (
        <Notice icon={Lock} tone="neutral">
          {register.submittedAt ? "This register is read-only for you." : "Only administrators can mark attendance this far back."}
        </Notice>
      )}
      {correctionMode && (
        <Notice icon={History} tone="info">
          This register is locked. Change the statuses that are wrong, then send a correction request for approval.
          {register.pendingCorrections > 0 && ` ${register.pendingCorrections} correction${register.pendingCorrections === 1 ? " is" : "s are"} already waiting.`}
        </Notice>
      )}
      {register.isOffDay && access === "edit" && !register.submittedAt && <Notice icon={TriangleAlert} tone="warning">This date is normally a day off. You can still record attendance if school is open.</Notice>}
      {draftAvailable && (
        <Notice icon={RotateCcw} tone="info" action={<Button size="xs" variant="outline" onClick={() => setEntries(readDraft(draftKey) ?? entries)}>Restore</Button>}>
          You have unsaved changes for this register from earlier.
        </Notice>
      )}

      {/* Headline + counters */}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs lg:flex-row lg:items-center">
        <div className="flex items-baseline gap-3">
          <p className="tabular text-[2rem] leading-none font-semibold">
            {attended}
            <span className="text-h2 text-muted-foreground">/{total}</span>
          </p>
          <div className="text-small leading-tight text-muted-foreground">
            <p>present{rate !== null ? ` · ${rate}%` : ""}</p>
            <p>
              {register.submittedAt ? (
                <>Saved{register.submittedBy ? ` by ${register.submittedBy}` : ""}</>
              ) : counts.unmarked === total ? (
                "Not taken yet"
              ) : (
                `${counts.unmarked} unmarked`
              )}
            </p>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          <Counter label="Present" value={counts.PRESENT} status="PRESENT" />
          <Counter label="Absent" value={counts.ABSENT} status="ABSENT" />
          <Counter label="Late" value={counts.LATE} status="LATE" />
          <Counter label="Leave" value={counts.LEAVE} status="LEAVE" />
        </div>
        {access === "edit" && (
          <Button size="lg" variant={counts.PRESENT === total ? "outline" : "default"} onClick={markAllPresent} className="lg:ms-2">
            <CheckCheck /> Mark all present
          </Button>
        )}
      </div>

      {total === 0 ? (
        <EmptyState icon={Users} title="No students in this section" description="Add students or move them into this section to take attendance." actions={<Button asChild variant="outline"><Link href="/students">Go to students</Link></Button>} />
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="relative w-full min-w-0 sm:w-auto sm:max-w-64 sm:flex-1">
              <Search className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a student" aria-label="Find a student" className="ps-9" />
            </div>
            <div role="tablist" aria-label="Show" className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
              {(
                [
                  ["all", `All ${total}`],
                  ["unmarked", `Unmarked ${counts.unmarked}`],
                  ["absent", `Absent ${counts.ABSENT}`],
                  ["late", `Late ${counts.LATE}`],
                ] as [Filter, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  type="button"
                  aria-selected={filter === key}
                  onClick={() => setFilter(key)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-small font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    filter === key ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="ms-auto hidden text-caption text-muted-foreground lg:block">
              Keyboard: <kbd className="rounded border bg-card px-1">P</kbd> <kbd className="rounded border bg-card px-1">A</kbd> <kbd className="rounded border bg-card px-1">L</kbd>{" "}
              <kbd className="rounded border bg-card px-1">V</kbd> to mark · <kbd className="rounded border bg-card px-1">↑</kbd>
              <kbd className="rounded border bg-card px-1">↓</kbd> to move
            </p>
          </div>

          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs" aria-label="Students">
            {visible.length === 0 && <li className="px-4 py-10 text-center text-small text-muted-foreground">No students match.</li>}
            {visible.map((s, index) => {
              const entry = entries[s.id]!;
              const changed = entry.status !== baseline[s.id]?.status;
              return (
                <li
                  key={s.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(s.id, el);
                    else rowRefs.current.delete(s.id);
                  }}
                  tabIndex={0}
                  onKeyDown={(e) => onRowKey(e, index, s.id)}
                  aria-label={`${s.name}, ${entry.status ? STATUS_META[entry.status].label : "not marked"}`}
                  className={cn(
                    "flex flex-col gap-2 px-3 py-2.5 outline-none focus-visible:bg-primary-subtle/50 sm:flex-row sm:items-center sm:gap-3 sm:px-4",
                    changed && "bg-warning-subtle/40",
                    !entry.status && "bg-muted/30",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="w-7 shrink-0 text-end tabular text-small text-muted-foreground">{s.rollNumber ?? "—"}</span>
                    <PersonAvatar name={s.name} size="sm" className="hidden sm:flex" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground">
                        <span className="font-mono">{s.admissionNo}</span>
                        {s.approvedLeave && <Badge variant="info">Approved leave</Badge>}
                        {entry.note && noteOpen !== s.id && <span className="truncate italic">“{entry.note}”</span>}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="sm:hidden"
                      aria-label={`Add note for ${s.name}`}
                      onClick={() => setNoteOpen(noteOpen === s.id ? null : s.id)}
                      disabled={!editable}
                    >
                      <MessageSquareText className={entry.note ? "text-primary" : undefined} />
                    </Button>
                  </div>
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <StatusPicker stretch value={entry.status} onChange={(st) => setStatus(s.id, st as Status)} disabled={!editable} label={`Status for ${s.name}`} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hidden sm:inline-flex"
                      aria-label={`Add note for ${s.name}`}
                      onClick={() => setNoteOpen(noteOpen === s.id ? null : s.id)}
                      disabled={!editable || correctionMode}
                    >
                      <MessageSquareText className={entry.note ? "text-primary" : undefined} />
                    </Button>
                  </div>
                  {noteOpen === s.id && (
                    <Input
                      autoFocus
                      value={entry.note ?? ""}
                      maxLength={200}
                      onChange={(e) => setEntries((prev) => ({ ...prev, [s.id]: { ...prev[s.id]!, note: e.target.value || null } }))}
                      onKeyDown={(e) => e.key === "Enter" && setNoteOpen(null)}
                      placeholder="Note, e.g. arrived 10 minutes late"
                      aria-label={`Note for ${s.name}`}
                      className="sm:w-64"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Sticky action bar — thumb-reachable on phones */}
      {editable && total > 0 && (
        <div className="fixed inset-x-0 bottom-14 z-(--z-sticky) border-t bg-background/95 px-4 py-3 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))] md:sticky md:bottom-4 md:mt-4 md:rounded-xl md:border md:shadow-lg">
          <div className="mx-auto flex max-w-content items-center gap-3">
            <p className="hidden min-w-0 flex-1 text-small text-muted-foreground sm:block" aria-live="polite">
              {counts.unmarked > 0 ? `${counts.unmarked} students still need a status` : dirty ? `${dirtyIds.length} changes not saved yet` : register.submittedAt ? "All changes saved" : "Everyone is marked — ready to save"}
            </p>
            {dirty && (
              <Button variant="ghost" onClick={() => setEntries(baseline)} disabled={saving}>
                Discard
              </Button>
            )}
            {correctionMode ? (
              <Button size="lg" className="flex-1 sm:flex-none" disabled={!dirty} onClick={() => setCorrectionOpen(true)}>
                Request correction{dirty ? ` (${dirtyIds.length})` : ""}
              </Button>
            ) : (
              <Button size="lg" className="flex-1 sm:flex-none" loading={saving} disabled={!dirty && !!register.submittedAt} onClick={save}>
                <CircleCheck /> {register.submittedAt ? "Save changes" : "Save attendance"}
              </Button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={correctionOpen}
        onOpenChange={setCorrectionOpen}
        title={`Request ${dirtyIds.length} correction${dirtyIds.length === 1 ? "" : "s"}`}
        description="An administrator will review the change. The register stays as it is until then."
        confirmLabel="Send request"
        onConfirm={async () => {
          if (reason.trim().length < 3) {
            toast.error("Add a short reason for the change.");
            throw new Error("reason");
          }
          await submitCorrection();
        }}
      >
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. student arrived after roll call" rows={3} aria-label="Reason" />
      </ConfirmDialog>
    </div>
  );
}

function Notice({ icon: Icon, tone, children, action }: { icon: typeof Lock; tone: "info" | "warning" | "neutral"; children: React.ReactNode; action?: React.ReactNode }) {
  const tones = {
    info: "border-info/25 bg-info-subtle text-info-foreground",
    warning: "border-warning/30 bg-warning-subtle text-warning-foreground",
    neutral: "border-border bg-muted text-muted-foreground",
  };
  return (
    <div role="status" className={cn("mb-4 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-small", tones[tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="flex-1">{children}</p>
      {action}
    </div>
  );
}
