import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/common/page-header";
import { requirePageContext } from "@/server/auth/context";
import { setupChecklist } from "@/server/modules/organizations/onboarding";
import { SetupActions } from "./setup-actions";

export const metadata: Metadata = { title: "Setup guide" };

export default async function OnboardingPage() {
  const ctx = await requirePageContext("settings.manage");
  const c = await setupChecklist(ctx);
  const next = c.steps.find((s) => !s.done && !s.optional);
  const pct = Math.round((c.done / c.total) * 100);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title={c.completedAt ? "Setup guide" : `Welcome to EduAttend, ${ctx.user.firstName}`} description={c.completedAt ? "Setup is complete. Use this list any time to check nothing's missing." : "A few steps and your teachers can take attendance from their phones. Each step ticks itself off when it's done."} />
      <div className="rounded-xl border bg-card p-5 shadow-xs">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="font-medium">
            {c.done} of {c.total} steps done
          </p>
          <span className="tabular text-small text-muted-foreground">{pct}%</span>
        </div>
        <Progress value={pct} aria-label={`Setup ${pct}% complete`} />
      </div>
      <ol className="flex flex-col gap-2">
        {c.steps.map((s, i) => (
          <li key={s.key}>
            <Link
              href={s.href}
              className={cn(
                "group flex items-start gap-4 rounded-xl border bg-card p-4 shadow-xs outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring",
                next?.key === s.key && "border-primary ring-1 ring-primary",
              )}
            >
              {s.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Done" /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Not done" />}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cn("font-medium", s.done && "text-muted-foreground")}>
                    {i + 1}. {s.title}
                  </span>
                  {s.optional && <Badge variant="neutral">Optional</Badge>}
                  {next?.key === s.key && <Badge variant="primary">Next</Badge>}
                </span>
                <span className="block text-small text-muted-foreground">{s.detail ?? s.description}</span>
              </span>
              <span className="mt-0.5 hidden shrink-0 items-center gap-1 text-small font-medium text-primary sm:flex">
                {s.done ? "Review" : s.action} <ChevronRight className="size-4 rtl:rotate-180" />
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {!c.completedAt && <SetupActions allDone={c.done === c.total} />}
    </div>
  );
}
