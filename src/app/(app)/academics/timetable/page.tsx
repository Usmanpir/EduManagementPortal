import type { Metadata } from "next";
import { can, requirePageContext } from "@/server/auth/context";
import { getTimetable, timetablePickers, type TimetableKind } from "@/server/modules/timetable/service";
import { isoWeekday, todayIn } from "@/lib/format";
import { TimetableView } from "./timetable-view";

export const metadata: Metadata = { title: "Timetable" };

export default async function TimetablePage({ searchParams }: PageProps<"/academics/timetable">) {
  const ctx = await requirePageContext("timetable.view");
  const sp = await searchParams;
  const pickers = await timetablePickers(ctx);
  const kind: TimetableKind = sp.view === "teacher" || sp.view === "room" ? sp.view : ctx.teacherId && !sp.view ? "teacher" : "section";
  const options = kind === "section" ? pickers.sections : kind === "teacher" ? pickers.teachers : pickers.rooms;
  const requested = typeof sp.id === "string" ? sp.id : null;
  const id = (requested && options.some((o) => o.value === requested) ? requested : null) ?? (kind === "teacher" && ctx.teacherId ? ctx.teacherId : options[0]?.value ?? null);

  const timetable = id ? await getTimetable(ctx, kind, id).catch(() => null) : null;
  const campuses = await ctx.db.campus.findMany({ where: { deletedAt: null, ...(ctx.allowedCampusIds ? { id: { in: ctx.allowedCampusIds } } : {}) }, select: { id: true, name: true }, orderBy: [{ isMain: "desc" }, { name: "asc" }] });

  return (
    <TimetableView
      kind={kind}
      id={id}
      pickers={{ section: pickers.sections, teacher: pickers.teachers, room: pickers.rooms }}
      timetable={timetable}
      canManage={can(ctx, "timetable.manage")}
      today={isoWeekday(todayIn(ctx.organization.timezone))}
      campuses={campuses}
      defaultCampusId={timetable?.campusId ?? ctx.campusId ?? campuses[0]?.id ?? null}
    />
  );
}
