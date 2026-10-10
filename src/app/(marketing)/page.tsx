import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarCheck2, ChartColumn, Check, Clock3, FileSpreadsheet, Languages, LockKeyhole, MessageCircle, ShieldCheck, Smartphone, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSession } from "@/server/auth/session";
import { homePathFor } from "@/server/modules/auth/service";

const FEATURES = [
  { icon: CalendarCheck2, title: "Attendance in under a minute", body: "Teachers mark a register from their phone with one tap per student — daily or period-wise. Late arrivals, leave and corrections built in." },
  { icon: MessageCircle, title: "Parents hear right away", body: "Absence alerts, fee reminders, receipts and results by WhatsApp, SMS, email or in the parent portal — on the channels you switch on." },
  { icon: Wallet, title: "Fees that add up", body: "Monthly invoices for every student in one click, sibling discounts, and cash, bank and JazzCash/Easypaisa payments recorded with receipts." },
  { icon: FileSpreadsheet, title: "Exams and report cards", body: "Date sheets, fast keyboard marks entry, automatic grades and positions, and printable report cards." },
  { icon: Clock3, title: "Timetable without clashes", body: "Build each section's week; EduAttend refuses double-booked teachers and rooms and shows every teacher their day." },
  { icon: ChartColumn, title: "Reports you can hand over", body: "Monthly registers, low-attendance lists, collections and subject analysis — preview, print or export to Excel." },
];

const LOCAL = [
  { icon: Languages, text: "English, اردو and العربية, with right-to-left layouts" },
  { icon: Wallet, text: "PKR by default, other currencies supported" },
  { icon: Users, text: "B-Form and CNIC fields, multi-campus schools" },
  { icon: Smartphone, text: "Phone-first — works in any modern browser" },
];

const PRIVACY = [
  "Every school's data is kept separate from every other school's",
  "Teachers see only the classes they teach; parents only their own children",
  "Roles and permissions you control, with an audit log of changes",
  "Documents stored privately behind links that expire after 15 minutes",
];

/** A static illustration of the register screen — made-up names, not anyone's data. */
function RegisterIllustration() {
  const rows = [
    ["1", "Ayesha", "P"],
    ["2", "Bilal", "P"],
    ["3", "Fatima", "L"],
    ["4", "Hamza", "A"],
    ["5", "Maryam", "P"],
  ];
  const style: Record<string, string> = { P: "border-success bg-success text-on-success", A: "border-danger bg-danger text-on-danger", L: "border-warning bg-warning text-[oklch(0.25_0.05_70)]" };
  return (
    <div aria-hidden className="mx-auto w-full max-w-md rounded-2xl border bg-card p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-small font-semibold">Grade 5 — A</p>
          <p className="text-caption text-muted-foreground">Today · 5 students</p>
        </div>
        <span className="rounded-full bg-success-subtle px-2.5 py-1 text-caption font-medium text-success-foreground">4 present</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {rows.map(([roll, name, st]) => (
          <li key={roll} className="flex items-center gap-3 rounded-lg border px-3 py-2">
            <span className="w-4 text-caption text-muted-foreground tabular">{roll}</span>
            <span className="flex-1 text-small font-medium">{name}</span>
            <span className="flex gap-1">
              {["P", "A", "L"].map((k) => (
                <span key={k} className={`grid size-7 place-items-center rounded-md border text-caption font-semibold ${k === st ? style[k] : "text-muted-foreground"}`}>
                  {k}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#dcf8c6] px-3 py-2 text-caption text-[#111] dark:bg-[#005c4b] dark:text-[#e9edef]">
        <MessageCircle className="size-3.5 shrink-0" /> Hamza was marked absent today.
      </div>
    </div>
  );
}

export default async function HomePage() {
  // Signed-in users go straight to their workspace, never the marketing site.
  const session = await getSession();
  if (session) redirect(homePathFor(session.user));

  return (
    <main>
      <section className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-12 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-2 lg:pt-24">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-caption font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5 text-success" aria-hidden /> For schools, colleges and academies
          </p>
          <h1 className="text-display text-balance sm:text-[3.25rem] sm:leading-[1.1]">Run your whole school from one simple platform.</h1>
          <p className="mt-5 max-w-xl text-[1.0625rem] text-muted-foreground">Attendance, students, teachers, fees, exams, parent communication and reports — designed around how schools in Pakistan actually work.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="xl" asChild>
              <Link href="/register">
                Start free trial <ArrowRight className="rtl:rotate-180" />
              </Link>
            </Button>
            <Button size="xl" variant="outline" asChild>
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
          <p className="mt-3 text-small text-muted-foreground">No card needed to start.</p>
        </div>
        <RegisterIllustration />
      </section>

      <section aria-labelledby="features" className="border-y bg-card">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 id="features" className="mx-auto mb-12 max-w-2xl text-center text-h1 text-balance">
            What the office, teachers and parents need — in one place
          </h2>
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-xl border bg-background p-6">
                <span className="mb-4 grid size-10 place-items-center rounded-lg bg-primary-subtle text-primary-subtle-foreground">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mb-1.5 font-semibold">{f.title}</h3>
                <p className="text-small text-muted-foreground">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 id="how" className="mb-10 text-center text-h1">
          How schools get started
        </h2>
        <ol className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            ["Create your school", "Sign up, then add your campuses and classes. A setup guide ticks each step off as you go."],
            ["Bring your data", "Import students and parents from the spreadsheet you already have. Problems are shown before anything is saved."],
            ["Invite your teachers", "They sign in on their phones and can take their first register straight away."],
          ].map(([t, b], i) => (
            <li key={t} className="flex gap-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground">{i + 1}</span>
              <span>
                <span className="block font-semibold">{t}</span>
                <span className="text-small text-muted-foreground">{b}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="local" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid grid-cols-1 gap-8 rounded-2xl border bg-card p-8 md:grid-cols-2 md:p-12">
          <div>
            <h2 id="local" className="text-h1">
              Made for local schools
            </h2>
            <p className="mt-3 text-muted-foreground">Pakistan defaults out of the box — and configurable for other countries.</p>
          </div>
          <ul className="flex flex-col gap-3">
            {LOCAL.map((l) => (
              <li key={l.text} className="flex items-center gap-3">
                <l.icon className="size-5 shrink-0 text-primary" aria-hidden /> {l.text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="trust" className="border-y bg-card">
        <div className="mx-auto grid grid-cols-1 max-w-6xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-2">
          <div>
            <span className="mb-4 grid size-10 place-items-center rounded-lg bg-success-subtle text-success-foreground">
              <LockKeyhole className="size-5" aria-hidden />
            </span>
            <h2 id="trust" className="text-h1">
              Private by design
            </h2>
            <p className="mt-3 text-muted-foreground">Student records are sensitive. EduAttend is built so the right people see the right things — and nobody else.</p>
          </div>
          <ul className="flex flex-col gap-3">
            {PRIVACY.map((t) => (
              <li key={t} className="flex gap-3">
                <Check className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
        <h2 className="text-h1 text-balance">Try it with your own school</h2>
        <p className="mt-3 text-muted-foreground">Every feature is included in every plan. Choose one when you&apos;re ready.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="xl" asChild>
            <Link href="/register">
              Start free trial <ArrowRight className="rtl:rotate-180" />
            </Link>
          </Button>
          <Button size="xl" variant="outline" asChild>
            <Link href="/pricing">Compare plans</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
