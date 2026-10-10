import { formatDate, formatPercent } from "@/lib/format";
import { ordinal } from "@/lib/grading";
import type { ReportCard } from "@/server/modules/exams/results";
import { PrintHeader } from "@/components/print/print-header";

type Org = { name: string; address?: string | null; phone?: string | null; email?: string | null };

/** One student's report card — designed for A4 paper, one per page. */
export function ReportCardView({ card: c, organization, footer }: { card: ReportCard; organization: Org; footer?: string }) {
  const r = c.result;
  return (
    <article className="relative text-small">
      {!c.exam.published && (
        <p className="mb-3 rounded-md border border-dashed border-warning bg-warning-subtle px-3 py-1.5 text-center text-caption font-medium text-warning-foreground print:bg-transparent">
          Provisional — results not yet published
        </p>
      )}
      <PrintHeader organization={organization} title="Report card" subtitle={c.exam.name} meta={<p className="text-caption text-muted-foreground">{formatDate(c.exam.from, "long")} – {formatDate(c.exam.to, "long")}</p>} />

      <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
        {[
          ["Student", c.name],
          ["Class", c.className ?? "—"],
          ["Roll no.", c.rollNumber ?? "—"],
          ["Admission no.", c.admissionNo],
          ...(c.guardian ? [["Parent / guardian", c.guardian]] : []),
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-caption text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y bg-muted/40 text-caption text-muted-foreground print:bg-transparent">
            <th className="px-2 py-2 text-start font-medium">Subject</th>
            <th className="px-2 py-2 text-end font-medium">Total</th>
            <th className="px-2 py-2 text-end font-medium">Pass</th>
            <th className="px-2 py-2 text-end font-medium">Obtained</th>
            <th className="px-2 py-2 text-center font-medium">Grade</th>
            <th className="px-2 py-2 text-start font-medium">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {c.subjects.map((s) => (
            <tr key={s.subject} className="border-b">
              <td className="px-2 py-1.5 font-medium">{s.subject}</td>
              <td className="px-2 py-1.5 text-end tabular">{s.maxMarks}</td>
              <td className="px-2 py-1.5 text-end tabular text-muted-foreground">{s.passMarks}</td>
              <td className={`px-2 py-1.5 text-end tabular font-medium ${s.entered && !s.passed ? "text-danger-foreground" : ""}`}>{s.absent ? "Absent" : s.obtained ?? "—"}</td>
              <td className="px-2 py-1.5 text-center">{s.grade ?? "—"}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{!s.entered ? "Not marked" : s.passed ? "" : "Below pass mark"}</td>
            </tr>
          ))}
        </tbody>
        {r && (
          <tfoot>
            <tr className="border-b font-semibold">
              <td className="px-2 py-2">Total</td>
              <td className="px-2 py-2 text-end tabular">{r.max}</td>
              <td />
              <td className="px-2 py-2 text-end tabular">{r.total}</td>
              <td className="px-2 py-2 text-center">{r.grade}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Percentage", r ? `${r.percentage.toFixed(2)}%` : "—"],
          ["Grade", r ? `${r.grade}${r.remark ? ` · ${r.remark}` : ""}` : "—"],
          ["Position", r?.position ? `${ordinal(r.position)}${r.outOf ? ` of ${r.outOf}` : ""}` : "—"],
          ["Attendance", c.attendance ? `${formatPercent(c.attendance.rate, 0)} (${c.attendance.present}/${c.attendance.total} days)` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border p-3">
            <p className="text-caption text-muted-foreground">{k}</p>
            <p className="font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-body font-semibold">
        Result:{" "}
        <span className={r?.status === "PASS" ? "text-success-foreground" : r?.status === "FAIL" ? "text-danger-foreground" : "text-muted-foreground"}>
          {r?.status === "PASS" ? "Passed" : r?.status === "FAIL" ? "Not passed" : "Incomplete"}
        </span>
      </p>

      <div className="mt-14 grid grid-cols-3 gap-8 text-center text-caption text-muted-foreground">
        {["Class teacher", "Principal", "Parent / guardian"].map((s) => (
          <div key={s} className="border-t pt-1.5">
            {s}
          </div>
        ))}
      </div>
      {footer && <p className="mt-6 text-center text-caption whitespace-pre-line text-muted-foreground">{footer}</p>}
    </article>
  );
}
