import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { can, isPortalUser, requirePageContext } from "@/server/auth/context";
import { visibleWhere } from "@/server/modules/communication/announcements";
import { staffDashboard } from "@/server/modules/dashboard/service";
import { familyDashboard } from "@/server/modules/portal/service";
import { getI18n } from "@/lib/i18n/server";
import { formatDate, greetingKey, hourIn, minuteIn, todayIn } from "@/lib/format";
import { FamilyDashboard } from "./family-dashboard";
import { StaffDashboard } from "./staff-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await requirePageContext("dashboard.view");
  const { t } = await getI18n();
  const today = todayIn(ctx.organization.timezone);
  const greeting = `${t(greetingKey(hourIn(ctx.organization.timezone)))}, ${ctx.user.firstName}`;
  const threshold = ctx.settings.attendance.lowAttendanceThreshold;

  if (isPortalUser(ctx)) {
    const [children, notices] = await Promise.all([
      familyDashboard(ctx),
      ctx.db.announcement.findMany({ where: { AND: [await visibleWhere(ctx), { status: "PUBLISHED" }] }, orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }], take: 4, select: { id: true, title: true, body: true, isPinned: true, publishedAt: true } }),
    ]);
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader eyebrow={formatDate(today, "weekday")} title={greeting} description={ctx.guardianId ? "Here's how your children are doing." : "Here's your day at a glance."} />
        <FamilyDashboard
          students={children}
          notices={notices.map((n) => ({ ...n, publishedAt: n.publishedAt?.toISOString() ?? null }))}
          currency={ctx.organization.currency}
          threshold={threshold}
          isParent={!!ctx.guardianId}
        />
      </div>
    );
  }

  const data = await staffDashboard(ctx);
  const isEmpty = data.counts && data.counts.students === 0 && data.counts.staff === 0 && data.counts.classes === 0;
  const campus = ctx.campusId ? await ctx.db.campus.findFirst({ where: { id: ctx.campusId }, select: { name: true } }) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={formatDate(today, "weekday")} title={greeting} description={`Here's what's happening at ${campus?.name ?? ctx.organization.name} today.`} />
      {isEmpty && can(ctx, "settings.manage") && (
        <div className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-xs sm:p-8">
          <div className="bg-grid absolute inset-0 opacity-60 [mask-image:linear-gradient(to_left,black,transparent_70%)]" />
          <div className="relative flex max-w-xl flex-col gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-primary-subtle text-primary-subtle-foreground">
              <Sparkles className="size-5" />
            </span>
            <h2 className="text-h2">Let&apos;s get your institution ready</h2>
            <p className="text-muted-foreground">Add your classes, staff and students — then teachers can start marking attendance from their phones. Setup takes a few minutes and you can skip any step.</p>
            <div className="mt-2">
              <Button asChild>
                <Link href="/onboarding">
                  Start setup <ArrowRight className="rtl:rotate-180" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
      <StaffDashboard
        d={data}
        currency={ctx.organization.currency}
        threshold={threshold}
        nowMinute={minuteIn(ctx.organization.timezone)}
        perms={{ students: can(ctx, "students.view"), teachers: can(ctx, "teachers.view"), staff: can(ctx, "staff.view"), academics: can(ctx, "academics.view") }}
      />
    </div>
  );
}
