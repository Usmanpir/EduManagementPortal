import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/print-header";
import { requirePageContext } from "@/server/auth/context";
import { getTimetable, type TimetableKind } from "@/server/modules/timetable/service";

export const metadata: Metadata = { title: "Timetable" };
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function PrintTimetable({ searchParams }: PageProps<"/timetable/print">) {
  const ctx = await requirePageContext("timetable.view");
  const { kind, id } = await searchParams;
  if ((kind !== "section" && kind !== "teacher" && kind !== "room") || typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const tt = await getTimetable(ctx, kind as TimetableKind, id).catch(() => notFound());
  const org = await ctx.db.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { name: true, address: true, phone: true, email: true } });
  const at = (d: number, p: string) => tt.entries.find((e) => e.dayOfWeek === d && e.periodId === p);

  return (
    <article>
      <PrintHeader organization={org} title="Timetable" subtitle={tt.title} />
      <table className="w-full table-fixed border-collapse text-caption">
        <thead>
          <tr>
            <th className="w-24 border p-1.5 text-start">Period</th>
            {tt.days.map((d) => (
              <th key={d} className="border p-1.5 text-start">{DAYS[d - 1]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tt.periods.map((p) => (
            <tr key={p.id} className={p.isBreak ? "bg-muted/40" : ""}>
              <th className="border p-1.5 text-start align-top font-normal">
                <span className="block font-medium">{p.name}</span>
                <span className="tabular text-muted-foreground">{p.start}–{p.end}</span>
              </th>
              {p.isBreak ? (
                <td colSpan={tt.days.length} className="border p-1.5 text-center text-muted-foreground">{p.name}</td>
              ) : (
                tt.days.map((d) => {
                  const e = at(d, p.id);
                  return (
                    <td key={d} className="h-14 border p-1.5 align-top" style={e?.color ? { borderInlineStart: `3px solid ${e.color}` } : undefined}>
                      {e && (
                        <>
                          <span className="block font-medium">{e.subject}</span>
                          <span className="block text-muted-foreground">{kind === "teacher" ? e.section : (e.teacher ?? "")}</span>
                          {e.room && kind !== "room" && <span className="block text-muted-foreground">{e.room}</span>}
                        </>
                      )}
                    </td>
                  );
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
