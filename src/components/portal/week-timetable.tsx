"use client";

import { useState } from "react";
import { cn } from "cn";

type Period = { id: string; name: string; start: string; end: string; isBreak: boolean };
type Entry = { id: string; dayOfWeek: number; periodId: string; subject: string; color: string | null; teacher: string | null; room: string | null };

const DAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Read-only weekly timetable: a day at a time on phones, the whole week on larger screens. */
export function WeekTimetable({ days, periods, entries, todayDow }: { days: number[]; periods: Period[]; entries: Entry[]; todayDow: number }) {
  const [day, setDay] = useState(days.includes(todayDow) ? todayDow : days[0]!);
  const cell = (d: number, p: Period) => entries.find((e) => e.dayOfWeek === d && e.periodId === p.id);

  return (
    <>
      {/* Phones */}
      <div className="md:hidden">
        <div role="tablist" aria-label="Day" className="no-scrollbar -mx-4 mb-3 flex gap-1 overflow-x-auto px-4">
          {days.map((d) => (
            <button
              key={d}
              role="tab"
              type="button"
              aria-selected={d === day}
              onClick={() => setDay(d)}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-small font-medium", d === day ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}
            >
              {DAY[d - 1]!.slice(0, 3)}
              {d === todayDow && <span className="sr-only"> (today)</span>}
            </button>
          ))}
        </div>
        <ol className="flex flex-col gap-2">
          {periods.map((p) => {
            const e = cell(day, p);
            if (p.isBreak)
              return (
                <li key={p.id} className="rounded-lg bg-muted/50 px-3 py-1.5 text-center text-caption text-muted-foreground">
                  {p.name} · {p.start}–{p.end}
                </li>
              );
            return (
              <li key={p.id} className="flex items-stretch gap-3 rounded-xl border bg-card p-3 shadow-xs">
                <div className="w-14 shrink-0 text-caption text-muted-foreground tabular">
                  <p className="font-medium text-foreground">{p.start}</p>
                  <p>{p.end}</p>
                </div>
                <span className="w-1 shrink-0 rounded-full" style={{ background: e?.color ?? "var(--border)" }} aria-hidden />
                <div className="min-w-0">
                  <p className={cn("font-medium", !e && "text-muted-foreground")}>{e?.subject ?? "Free period"}</p>
                  {e && <p className="truncate text-caption text-muted-foreground">{[e.teacher, e.room].filter(Boolean).join(" · ")}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Tablets & desktops */}
      <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-xs md:block">
        <table className="w-full table-fixed text-small">
          <thead>
            <tr className="border-b bg-muted/40">
              <th scope="col" className="w-24 px-3 py-2 text-start text-caption font-medium text-muted-foreground">
                Period
              </th>
              {days.map((d) => (
                <th key={d} scope="col" className={cn("px-2 py-2 text-start text-caption font-medium", d === todayDow ? "text-primary" : "text-muted-foreground")}>
                  {DAY[d - 1]}
                  {d === todayDow && " · today"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((p) =>
              p.isBreak ? (
                <tr key={p.id} className="border-b bg-muted/30">
                  <th scope="row" className="px-3 py-1 text-start text-caption font-normal text-muted-foreground tabular">
                    {p.start}
                  </th>
                  <td colSpan={days.length} className="px-2 py-1 text-center text-caption text-muted-foreground">
                    {p.name}
                  </td>
                </tr>
              ) : (
                <tr key={p.id} className="border-b last:border-0">
                  <th scope="row" className="px-3 py-2 text-start align-top font-normal">
                    <span className="block text-caption font-medium">{p.name}</span>
                    <span className="block text-caption text-muted-foreground tabular">
                      {p.start}–{p.end}
                    </span>
                  </th>
                  {days.map((d) => {
                    const e = cell(d, p);
                    return (
                      <td key={d} className={cn("p-1 align-top", d === todayDow && "bg-primary-subtle/20")}>
                        {e ? (
                          <div className="rounded-md border-s-4 bg-muted/40 px-2 py-1.5" style={{ borderInlineStartColor: e.color ?? "var(--chart-1)" }}>
                            <p className="truncate font-medium">{e.subject}</p>
                            <p className="truncate text-caption text-muted-foreground">{e.teacher ?? ""}</p>
                          </div>
                        ) : (
                          <span className="block px-2 py-1.5 text-caption text-subtle-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
