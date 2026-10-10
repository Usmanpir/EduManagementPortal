import { Check, Clock3, X } from "lucide-react";

const ROWS = [
  { name: "Ayesha Raza", roll: "01", status: "present" },
  { name: "Bilal Ahmed", roll: "02", status: "present" },
  { name: "Fatima Noor", roll: "03", status: "late" },
  { name: "Hamza Tariq", roll: "04", status: "absent" },
  { name: "Imran Malik", roll: "05", status: "present" },
] as const;

const STATUS = {
  present: { label: "Present", icon: Check, className: "bg-success-subtle text-success-foreground" },
  late: { label: "Late", icon: Clock3, className: "bg-warning-subtle text-warning-foreground" },
  absent: { label: "Absent", icon: X, className: "bg-danger-subtle text-danger-foreground" },
};

/** Decorative product preview shown beside the auth forms (illustrative names, not real data). */
export function AuthShowcase() {
  return (
    <aside
      aria-hidden
      className="relative hidden overflow-hidden border-s bg-canvas lg:flex lg:flex-col lg:justify-center lg:px-12 xl:px-20"
    >
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <div className="absolute -top-40 -inset-e-40 size-[28rem] rounded-full bg-primary/10 blur-3xl" />

      <div className="relative mx-auto w-full max-w-lg">
        <p className="text-small font-medium text-primary">Attendance in seconds</p>
        <h2 className="mt-2 text-h1 text-balance text-foreground">
          Teachers mark a full class in under a minute. Parents know the moment it matters.
        </h2>

        <div className="mt-10 rounded-xl border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <p className="text-h3">Grade 10 — Section A</p>
              <p className="text-caption text-muted-foreground">Mathematics · 09:00 – 09:45</p>
            </div>
            <div className="text-end">
              <p className="tabular text-h2">
                36<span className="text-muted-foreground">/40</span>
              </p>
              <p className="text-caption text-muted-foreground">present</p>
            </div>
          </div>
          <ul className="divide-y">
            {ROWS.map((row) => {
              const s = STATUS[row.status];
              return (
                <li key={row.roll} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="grid size-8 place-items-center rounded-full bg-muted text-caption font-semibold text-muted-foreground">
                    {row.name
                      .split(" ")
                      .map((p) => p[0])
                      .join("")}
                  </span>
                  <span className="flex-1 text-small font-medium">{row.name}</span>
                  <span className="tabular text-caption text-muted-foreground">#{row.roll}</span>
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-caption font-medium ${s.className}`}>
                    <s.icon className="size-3" />
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative -mt-6 ms-auto me-6 w-72 animate-enter rounded-lg border bg-popover p-4 shadow-xl [animation-delay:300ms]">
          <p className="text-caption font-medium text-danger-foreground">Attendance alert</p>
          <p className="mt-1 text-small">Hamza Tariq was marked absent today.</p>
          <p className="mt-1 text-caption text-muted-foreground">Sent to guardian via WhatsApp · just now</p>
        </div>
      </div>
    </aside>
  );
}
