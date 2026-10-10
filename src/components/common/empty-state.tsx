import { CircleAlert, type LucideIcon } from "lucide-react";
import { cn } from "cn";

/** Friendly "nothing here yet" with the next useful action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  className,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 rounded-xl border border-dashed bg-card/50 px-6 py-14",
        className,
      )}
    >
      <span className={cn("relative grid place-items-center rounded-xl bg-primary-subtle text-primary-subtle-foreground", compact ? "size-10" : "size-12")}>
        <Icon className={compact ? "size-5" : "size-6"} aria-hidden />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-h3 text-foreground">{title}</p>
        {description && <p className="text-small text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}

/** Understandable failure with a recovery action — never a raw status code. */
export function ErrorState({
  title = "We couldn't load this right now",
  description = "This is usually temporary. Please try again in a moment.",
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-xl bg-danger-subtle text-danger-foreground">
        <CircleAlert className="size-6" aria-hidden />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-h3">{title}</p>
        <p className="text-small text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
