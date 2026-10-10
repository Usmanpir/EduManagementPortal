import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { requirePageContext } from "@/server/auth/context";
import { checkInToken } from "@/server/modules/attendance/staff";
import { env } from "@/server/env";
import { formatDate, todayIn } from "@/lib/format";
import { CampusPicker, PrintButton } from "./campus-picker";

export const metadata: Metadata = { title: "Staff check-in QR" };

/** Kiosk/poster page: staff scan today's code with their phone to check in. Changes every day. */
export default async function StaffQrPage({ searchParams }: PageProps<"/attendance/staff/qr">) {
  const ctx = await requirePageContext("staff_attendance.mark");
  const campuses = await ctx.db.campus.findMany({
    where: { deletedAt: null, ...(ctx.allowedCampusIds ? { id: { in: ctx.allowedCampusIds } } : {}) },
    select: { id: true, name: true },
    orderBy: [{ isMain: "desc" }, { name: "asc" }],
  });
  const { campus: raw } = await searchParams;
  const campus = campuses.find((c) => c.id === raw) ?? campuses.find((c) => c.id === ctx.campusId) ?? campuses[0];

  if (!ctx.settings.attendance.staffQrCheckIn || !campus) {
    return <EmptyState icon={QrCode} title="QR check-in is off" description="Turn it on in Settings → Attendance." />;
  }
  const today = todayIn(ctx.organization.timezone);
  const url = `${env.APP_URL}/check-in?${new URLSearchParams({ c: campus.id, t: checkInToken(ctx.orgId, campus.id, today) })}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111827", light: "#ffffff" } });

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-4 text-center">
      {/* Refresh hourly so a kiosk screen rolls over to the new day's code. */}
      <meta httpEquiv="refresh" content="3600" />
      <div className="no-print flex w-full flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" asChild>
          <Link href="/attendance/staff">
            <ArrowLeft className="rtl:rotate-180" /> Staff attendance
          </Link>
        </Button>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {campuses.length > 1 && <CampusPicker campuses={campuses} value={campus.id} />}
          <PrintButton />
        </div>
      </div>
      <div>
        <p className="text-small font-medium text-primary">{ctx.organization.name}</p>
        <h1 className="text-display">Staff check-in</h1>
        <p className="mt-1 text-muted-foreground">
          {campus.name} · {formatDate(today, "weekday")}
        </p>
      </div>
      <div className="rounded-2xl border bg-white p-5 shadow-lg" aria-label="Check-in QR code" dangerouslySetInnerHTML={{ __html: svg }} style={{ width: "min(80vw, 360px)" }} />
      <ol className="flex flex-col gap-1 text-start text-muted-foreground">
        <li>1. Open your phone camera and scan the code.</li>
        <li>2. Sign in to EduAttend if asked, then tap <strong className="text-foreground">Check in</strong>.</li>
        <li>3. Scan again when you leave to record check-out.</li>
      </ol>
      <p className="text-caption text-subtle-foreground">This code changes every day and only works at {campus.name}.</p>
    </div>
  );
}
