import type { Metadata } from "next";
import { PrintHeader } from "@/components/print/print-header";
import { requirePageContext } from "@/server/auth/context";
import { attendanceReport } from "@/server/modules/attendance/report";
import { addDays, formatDate, formatDateTime, formatPercent, todayIn } from "@/lib/format";
import { auditFor } from "@/server/audit";

export const metadata: Metadata = { title: "Attendance report" };

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export default async function PrintAttendanceReport({ searchParams }: PageProps<"/reports/print/attendance">) {
  const ctx = await requirePageContext("attendance.view", "reports.export");
  const sp = await searchParams;
  const today = todayIn(ctx.organization.timezone);
  const to = isDate(sp.to) ? sp.to : today;
  const from = isDate(sp.from) ? sp.from : addDays(to, -29);
  const report = await attendanceReport(ctx, { from, to, classId: isId(sp.classId) ? sp.classId : null, sectionId: isId(sp.sectionId) ? sp.sectionId : null });
  const org = await ctx.db.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { name: true, address: true, phone: true, email: true } });
  await auditFor(ctx)({ action: "report.export", entityType: "report", metadata: { report: "attendance", format: "pdf", from, to } });
  const threshold = ctx.settings.attendance.lowAttendanceThreshold;

  return (
    <article className="text-small">
      <PrintHeader organization={org} title="Attendance report" subtitle={`${formatDate(from, "long")} – ${formatDate(to, "long")}`} />
      <dl className="mb-6 grid grid-cols-4 gap-3">
        {[
          ["Attendance rate", formatPercent(report.totals.rate, 1)],
          ["School days", String(report.totals.schoolDays)],
          ["Absences", String(report.totals.absent)],
          ["Late arrivals", String(report.totals.late)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border p-3">
            <dt className="text-caption text-muted-foreground">{k}</dt>
            <dd className="tabular text-h2">{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mb-2 text-h3">By section</h2>
      <table className="mb-6 w-full border-collapse">
        <thead>
          <tr className="border-b text-caption text-muted-foreground">
            {["Section", "Students", "Present", "Late", "Absent", "Leave", "Rate"].map((h, i) => (
              <th key={h} className={`py-1.5 font-medium ${i ? "text-end" : "text-start"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.sections.map((s) => (
            <tr key={s.id} className="border-b">
              <td className="py-1.5">{s.label}</td>
              <td className="py-1.5 text-end tabular">{s.students}</td>
              <td className="py-1.5 text-end tabular">{s.present}</td>
              <td className="py-1.5 text-end tabular">{s.late}</td>
              <td className="py-1.5 text-end tabular">{s.absent}</td>
              <td className="py-1.5 text-end tabular">{s.leave}</td>
              <td className="py-1.5 text-end tabular font-medium">{formatPercent(s.rate, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-2 text-h3">Students below {threshold}%</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b text-caption text-muted-foreground">
            {["Student", "Admission no.", "Class", "Absent", "Late", "Rate"].map((h, i) => (
              <th key={h} className={`py-1.5 font-medium ${i >= 3 ? "text-end" : "text-start"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.students
            .filter((s) => s.rate !== null && s.rate < threshold)
            .map((s) => (
              <tr key={s.studentId} className="border-b">
                <td className="py-1.5">{s.name}</td>
                <td className="py-1.5 font-mono">{s.admissionNo}</td>
                <td className="py-1.5">{s.section ?? "—"}</td>
                <td className="py-1.5 text-end tabular">{s.counts.absent}</td>
                <td className="py-1.5 text-end tabular">{s.counts.late}</td>
                <td className="py-1.5 text-end tabular font-medium">{formatPercent(s.rate, 1)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <p className="mt-8 text-caption text-muted-foreground">Generated {formatDateTime(new Date(), ctx.organization.timezone)} by {ctx.user.firstName} {ctx.user.lastName} · EduAttend</p>
    </article>
  );
}
