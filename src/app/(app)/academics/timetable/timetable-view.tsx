"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, CalendarRange, Coffee, Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/common/combobox";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { useUrlState } from "@/components/data/use-url-state";
import { api, errorMessage } from "@/lib/api-client";
import type { getTimetable, TimetableKind } from "@/server/modules/timetable/service";
import { BellScheduleDrawer } from "./bell-schedule-drawer";
import { LessonDialog, loadLessonOptions } from "./lesson-dialog";

type Timetable = Awaited<ReturnType<typeof getTimetable>>;
type Entry = Timetable["entries"][number];
type Option = { value: string; label: string };

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function LessonCard({ entry, kind, onClick, editable }: { entry: Entry; kind: TimetableKind; onClick?: () => void; editable: boolean }) {
  const secondary = kind === "teacher" ? entry.section : kind === "room" ? `${entry.section}${entry.teacher ? ` · ${entry.teacher}` : ""}` : entry.teacher ?? "No teacher";
  const Comp = editable ? "button" : "div";
  return (
    <Comp
      type={editable ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden rounded-md border bg-card px-2.5 py-1.5 text-start shadow-xs",
        editable && "transition-colors outline-none hover:border-border-strong hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className="absolute inset-y-0 inset-s-0 w-1" style={{ background: entry.color ?? "var(--primary)" }} aria-hidden />
      <span className="truncate text-small font-medium">{entry.subject}</span>
      <span className="truncate text-caption text-muted-foreground">{secondary}</span>
      {entry.room && kind !== "room" && <span className="truncate text-caption text-subtle-foreground">{entry.room}</span>}
    </Comp>
  );
}

export function TimetableView({
  kind,
  id,
  pickers,
  timetable,
  canManage,
  today,
  campuses,
  defaultCampusId,
}: {
  kind: TimetableKind;
  id: string | null;
  pickers: Record<TimetableKind, Option[]>;
  timetable: Timetable | null;
  canManage: boolean;
  today: number;
  campuses: { id: string; name: string }[];
  defaultCampusId: string | null;
}) {
  const router = useRouter();
  const { set } = useUrlState();
  const [day, setDay] = useState(timetable?.days.includes(today) ? today : (timetable?.days[0] ?? 1));
  const [editing, setEditing] = useState<{ dayOfWeek: number; periodId: string; entry: Entry | null } | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const editable = canManage && kind === "section";
  const sectionId = editable ? timetable?.id : undefined;
  // Warm the lesson editor's options so clicking a slot opens a ready form.
  useEffect(() => {
    if (sectionId) loadLessonOptions(sectionId).catch(() => undefined);
  }, [sectionId]);
  const at = (d: number, periodId: string) => timetable?.entries.find((e) => e.dayOfWeek === d && e.periodId === periodId) ?? null;
  const tabs: { key: TimetableKind; label: string }[] = [
    { key: "section", label: "Class" },
    ...(pickers.teacher.length ? [{ key: "teacher" as const, label: "Teacher" }] : []),
    { key: "room", label: "Room" },
  ];
  const lessons = timetable?.entries.length ?? 0;

  const remove = async (entryId: string) => {
    try {
      toast.success((await api.delete(`/api/timetable/entries/${entryId}`)).message);
      if (sectionId) loadLessonOptions(sectionId, { fresh: true }).catch(() => undefined);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const cell = (d: number, p: Timetable["periods"][number]) => {
    const entry = at(d, p.id);
    if (entry) return <LessonCard entry={entry} kind={kind} editable={editable} onClick={() => setEditing({ dayOfWeek: d, periodId: p.id, entry })} />;
    if (!editable) return <span className="block h-full rounded-md border border-dashed border-transparent" />;
    return (
      <button
        type="button"
        onClick={() => setEditing({ dayOfWeek: d, periodId: p.id, entry: null })}
        aria-label={`Add lesson on ${DAY_LONG[d - 1]}, ${p.name}`}
        className="group grid h-full w-full place-items-center rounded-md border border-dashed text-muted-foreground transition-colors outline-none hover:border-primary/50 hover:bg-primary-subtle/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
      </button>
    );
  };

  return (
    <div>
      <PageHeader
        title="Timetable"
        description={timetable ? `${timetable.title} · ${lessons} ${lessons === 1 ? "lesson" : "lessons"} a week` : "Weekly schedule for classes, teachers and rooms."}
        actions={
          <>
            {canManage && (
              <Button variant="outline" onClick={() => setBellOpen(true)}>
                <BellRing /> Bell schedule
              </Button>
            )}
            {timetable && (
              <Button variant="outline" asChild>
                <Link href={`/timetable/print?kind=${kind}&id=${id}`} target="_blank">
                  <Printer /> Print
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="View" className="flex gap-1 rounded-lg bg-muted p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={kind === t.key}
              onClick={() => set({ view: t.key, id: null })}
              className={cn("rounded-md px-3 py-1 text-small font-medium", kind === t.key ? "bg-card shadow-xs" : "text-muted-foreground hover:text-foreground")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-72">
          <Combobox ariaLabel={kind === "section" ? "Class" : kind === "teacher" ? "Teacher" : "Room"} value={id} onChange={(v) => set({ view: kind, id: v })} options={pickers[kind]} placeholder={`Choose a ${kind === "section" ? "class" : kind}`} searchPlaceholder="Search…" />
        </div>
      </div>

      {!timetable ? (
        <EmptyState icon={CalendarRange} title="Nothing to show yet" description="Create classes, teachers and rooms first, then build the timetable here." />
      ) : timetable.periods.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="Set up the bell schedule first"
          description="Define your periods and breaks — e.g. Period 1, 08:00–08:40 — then fill in lessons."
          actions={canManage && <Button onClick={() => setBellOpen(true)}><BellRing /> Set up periods</Button>}
        />
      ) : (
        <>
          {/* Desktop: weekly grid */}
          <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-xs md:block">
            <table className="w-full table-fixed border-collapse text-small">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th scope="col" className="w-28 px-3 py-2 text-start text-caption font-medium text-muted-foreground">
                    Period
                  </th>
                  {timetable.days.map((d) => (
                    <th key={d} scope="col" className={cn("px-2 py-2 text-start text-caption font-medium", d === today ? "text-primary" : "text-muted-foreground")}>
                      {DAY_SHORT[d - 1]}
                      {d === today && <span className="ms-1.5 rounded-sm bg-primary-subtle px-1 text-primary-subtle-foreground">Today</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timetable.periods.map((p) =>
                  p.isBreak ? (
                    <tr key={p.id} className="border-b bg-muted/30">
                      <th scope="row" className="px-3 py-1.5 text-start font-normal">
                        <span className="block text-caption font-medium">{p.name}</span>
                        <span className="block text-caption text-muted-foreground tabular">{p.start}–{p.end}</span>
                      </th>
                      <td colSpan={timetable.days.length} className="px-2 py-1.5 text-center text-caption text-muted-foreground">
                        <Coffee className="me-1.5 inline size-3.5" /> {p.name}
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.id} className="border-b last:border-0">
                      <th scope="row" className="px-3 py-2 text-start align-top font-normal">
                        <span className="block font-medium">{p.name}</span>
                        <span className="block text-caption text-muted-foreground tabular">{p.start}–{p.end}</span>
                      </th>
                      {timetable.days.map((d) => (
                        <td key={d} className={cn("h-[4.5rem] p-1", d === today && "bg-primary-subtle/20")}>
                          {cell(d, p)}
                        </td>
                      ))}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          {/* Phones: one day at a time */}
          <div className="md:hidden">
            <div role="tablist" aria-label="Day" className="no-scrollbar mb-3 flex gap-1 overflow-x-auto">
              {timetable.days.map((d) => (
                <button
                  key={d}
                  role="tab"
                  type="button"
                  aria-selected={day === d}
                  onClick={() => setDay(d)}
                  className={cn("shrink-0 rounded-lg border px-3 py-1.5 text-small font-medium", day === d ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}
                >
                  {DAY_SHORT[d - 1]}
                </button>
              ))}
            </div>
            <ul className="flex flex-col gap-2">
              {timetable.periods.map((p) => (
                <li key={p.id} className="flex items-stretch gap-3">
                  <div className="w-14 shrink-0 pt-2 text-caption text-muted-foreground tabular">
                    <p className="font-medium text-foreground">{p.start}</p>
                    <p>{p.end}</p>
                  </div>
                  <div className="min-h-14 flex-1">{p.isBreak ? <p className="rounded-md bg-muted px-3 py-3 text-small text-muted-foreground">{p.name}</p> : cell(day, p)}</div>
                </li>
              ))}
            </ul>
          </div>
          {editable && <p className="mt-3 text-caption text-muted-foreground">Click a slot to add or change a lesson. Teacher and room clashes are blocked automatically.</p>}
        </>
      )}

      {editing && sectionId && timetable && (
        <LessonDialog
          sectionId={sectionId}
          dayLabel={DAY_LONG[editing.dayOfWeek - 1]!}
          period={timetable.periods.find((p) => p.id === editing.periodId)!}
          dayOfWeek={editing.dayOfWeek}
          entry={editing.entry}
          onClose={() => setEditing(null)}
          onRemove={editing.entry ? () => remove(editing.entry!.id) : undefined}
        />
      )}
      {bellOpen && <BellScheduleDrawer open={bellOpen} onOpenChange={setBellOpen} campuses={campuses} defaultCampusId={defaultCampusId} />}
    </div>
  );
}
