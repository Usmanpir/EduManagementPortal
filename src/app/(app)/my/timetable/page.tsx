import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { ChildSwitcher } from "@/components/portal/child-switcher";
import { NoStudent } from "@/components/portal/no-student";
import { WeekTimetable } from "@/components/portal/week-timetable";
import { myTimetable } from "@/server/modules/portal/service";
import { isoWeekday, todayIn } from "@/lib/format";
import { portalPage } from "../portal-page";

export const metadata: Metadata = { title: "Timetable" };

export default async function MyTimetablePage({ searchParams }: PageProps<"/my/timetable">) {
  const { ctx, students, student, isParent } = await portalPage(searchParams, "/academics/timetable");
  if (!student) return <NoStudent isParent={isParent} />;
  const tt = await myTimetable(ctx, student.id);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader title="Timetable" description={`${student.name}${student.className ? ` · ${student.className}` : ""}`} />
      <ChildSwitcher students={students} selectedId={student.id} />
      {!tt || tt.entries.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No timetable yet" description="The school hasn't published a timetable for this class yet." />
      ) : (
        <WeekTimetable days={tt.days} periods={tt.periods} entries={tt.entries} todayDow={isoWeekday(todayIn(ctx.organization.timezone))} />
      )}
    </div>
  );
}
