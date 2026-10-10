import Link from "next/link";
import { CalendarCheck2, CalendarClock, ChevronRight, FileText, Megaphone, Wallet } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/common/person-avatar";
import { RelativeTime } from "@/components/common/relative-time";
import { SectionHeader } from "@/components/common/page-header";
import { STATUS_META, type StatusKey } from "@/components/attendance/status";
import { NoStudent } from "@/components/portal/no-student";
import type { familyDashboard } from "@/server/modules/portal/service";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { ordinal } from "@/lib/grading";

type Child = Awaited<ReturnType<typeof familyDashboard>>[number];
type Notice = { id: string; title: string; body: string; publishedAt: string | null; isPinned: boolean };

function Tile({ href, icon: Icon, label, children, tone = "neutral" }: { href: string; icon: typeof Wallet; label: string; children: React.ReactNode; tone?: "neutral" | "danger" | "warning" | "success" }) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-1 rounded-lg border bg-background/60 p-3 outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring",
        tone === "danger" && "border-danger/30 bg-danger-subtle/40",
        tone === "warning" && "border-warning/40 bg-warning-subtle/40",
      )}
    >
      <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
        <Icon className="size-3.5" aria-hidden /> {label}
      </span>
      <span className="text-small font-medium">{children}</span>
    </Link>
  );
}

function ChildCard({ c, currency, threshold }: { c: Child; currency: string; threshold: number }) {
  const status = c.today ? STATUS_META[c.today as StatusKey] : null;
  const q = `?student=${c.id}`;
  const low = c.month.rate !== null && c.month.rate < threshold;
  return (
    <article className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      {/* On phones the status badge drops under the name so the name isn't cut off. */}
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <PersonAvatar name={c.name} size="lg" />
        <div className="min-w-0 flex-1 basis-40">
          <h2 className="text-h3 break-words">{c.name}</h2>
          <p className="text-small text-muted-foreground">
            {c.className ?? "Not placed in a class"} · Adm. {c.admissionNo}
          </p>
        </div>
        {status ? (
          <Badge variant={c.today === "ABSENT" ? "danger" : c.today === "LATE" ? "warning" : c.today === "LEAVE" ? "info" : "success"} dot>
            Today: {status.label}
          </Badge>
        ) : (
          <Badge variant="neutral">Not marked yet today</Badge>
        )}
      </header>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile href={`/my/attendance${q}`} icon={CalendarCheck2} label="Attendance this month" tone={low ? "warning" : "neutral"}>
          {formatPercent(c.month.rate, 0)}
          {c.month.counts.absent > 0 && <span className="font-normal text-muted-foreground"> · {c.month.counts.absent} absent</span>}
        </Tile>
        <Tile href={`/my/fees${q}`} icon={Wallet} label="Fees due" tone={c.fees.overdue ? "danger" : "neutral"}>
          {c.fees.balance > 0 ? formatMoney(c.fees.balance, currency) : "All paid"}
          {c.fees.balance > 0 && c.fees.nextDue && <span className="block text-caption font-normal text-muted-foreground">{c.fees.overdue ? "Overdue" : `Due ${formatDate(c.fees.nextDue)}`}</span>}
        </Tile>
        <Tile href={`/my/results${q}${c.latestResult ? `&exam=${c.latestResult.examId}` : ""}`} icon={FileText} label="Latest result">
          {c.latestResult ? (
            <>
              {c.latestResult.percentage.toFixed(1)}% · {c.latestResult.grade}
              <span className="block truncate text-caption font-normal text-muted-foreground">
                {c.latestResult.exam}
                {c.latestResult.position ? ` · ${ordinal(c.latestResult.position)}` : ""}
              </span>
            </>
          ) : (
            "None yet"
          )}
        </Tile>
        <Tile href={`/my/timetable${q}`} icon={CalendarClock} label="Next exam">
          {c.nextExam ? (
            <>
              <span className="block truncate">{c.nextExam.name}</span>
              <span className="block text-caption font-normal text-muted-foreground">from {formatDate(c.nextExam.from)}</span>
            </>
          ) : (
            "None scheduled"
          )}
        </Tile>
      </div>
    </article>
  );
}

export function FamilyDashboard({ students, notices, currency, threshold, isParent }: { students: Child[]; notices: Notice[]; currency: string; threshold: number; isParent: boolean }) {
  if (!students.length) return <NoStudent isParent={isParent} />;
  return (
    <div className="flex flex-col gap-6">
      <section aria-label={isParent ? "Your children" : "Your summary"} className="flex flex-col gap-3">
        {students.map((c) => (
          <ChildCard key={c.id} c={c} currency={currency} threshold={threshold} />
        ))}
      </section>
      <section aria-labelledby="notices">
        <SectionHeader
          title={<span id="notices">From the school</span>}
          actions={
            <Link href="/communication/announcements" className="text-small font-medium text-primary hover:underline">
              All announcements
            </Link>
          }
        />
        {notices.length === 0 ? (
          <p className="rounded-xl border bg-card p-4 text-small text-muted-foreground">No announcements yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card shadow-xs">
            {notices.map((n) => (
              <li key={n.id}>
                <Link href={`/communication/announcements?id=${n.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40">
                  <Megaphone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{n.title}</span>
                    <span className="line-clamp-2 text-small text-muted-foreground">{n.body}</span>
                    {n.publishedAt && <RelativeTime date={n.publishedAt} className="text-caption text-subtle-foreground" />}
                  </span>
                  <ChevronRight className="mt-1 size-4 text-muted-foreground rtl:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
