import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { LinkPending } from "./link-pending";

const TONES = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary-subtle text-primary-subtle-foreground",
  success: "bg-success-subtle text-success-foreground",
  warning: "bg-warning-subtle text-warning-foreground",
  danger: "bg-danger-subtle text-danger-foreground",
  info: "bg-info-subtle text-info-foreground",
};

export type StatTone = keyof typeof TONES;

/**
 * A single headline number. Keep the label a plain question-answer
 * ("Students present") and put context in `hint`, not in the label.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  trend,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  /** Signed change vs. the comparison period; `goodWhen` decides the color. */
  trend?: { value: string; direction: "up" | "down" | "flat"; goodWhen?: "up" | "down" };
  href?: string;
  className?: string;
}) {
  const good = trend && trend.direction !== "flat" && trend.direction === (trend.goodWhen ?? "up");
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-small font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", TONES[tone])}>
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      {/* Value size follows the card's width, so amounts like "PKR 1,250,000" stay on one line in narrow grids. */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <p className="tabular text-lg leading-8 font-semibold tracking-tight whitespace-nowrap text-foreground @[9.5rem]:text-xl @[12rem]:text-2xl @[15rem]:text-[1.75rem] @[15rem]:leading-9">{value}</p>
        {trend && trend.direction !== "flat" && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-caption font-semibold",
              good ? "text-success-foreground" : "text-danger-foreground",
            )}
          >
            {trend.direction === "up" ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {trend.value}
          </span>
        )}
      </div>
      {hint && <p className="mt-0.5 text-caption text-muted-foreground">{hint}</p>}
    </>
  );

  const base = cn("@container flex min-w-0 flex-col rounded-xl border bg-card p-4 shadow-xs sm:p-5", className);
  return href ? (
    <Link
      href={href}
      className={cn(
        base,
        "transition-[border-color,box-shadow] duration-200 ease-standard hover:border-border-strong hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      )}
    >
      {content}
      <LinkPending />
    </Link>
  ) : (
    <div className={base}>{content}</div>
  );
}
