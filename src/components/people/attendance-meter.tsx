import { cn } from "cn";

/**
 * Compact attendance rate: a bar plus the number. Color always comes with the
 * number (never color alone), and turns warning/danger below the threshold.
 */
export function AttendanceMeter({ rate, threshold = 75, className }: { rate: number | null; threshold?: number; className?: string }) {
  if (rate === null)
    return (
      <span className="text-small text-subtle-foreground">
        <span aria-hidden>—</span>
        <span className="sr-only">No attendance recorded yet</span>
      </span>
    );
  const tone = rate >= threshold ? "bg-success" : rate >= threshold - 10 ? "bg-warning" : "bg-danger";
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(2, Math.round(rate))}%` }} />
      </span>
      <span className={cn("tabular text-small font-medium", rate < threshold && "text-danger-foreground")}>{Math.round(rate)}%</span>
    </span>
  );
}
