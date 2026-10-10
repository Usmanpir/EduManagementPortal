import { Check, Clock3, Plane, X, type LucideIcon } from "lucide-react";
import { cn } from "cn";

export type StatusKey = "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "HALF_DAY";

export const STATUS_META: Record<StatusKey, { label: string; short: string; key: string; icon: LucideIcon; active: string; dot: string; text: string }> = {
  PRESENT: { label: "Present", short: "P", key: "p", icon: Check, active: "bg-success text-on-success border-success", dot: "bg-success", text: "text-success-foreground" },
  ABSENT: { label: "Absent", short: "A", key: "a", icon: X, active: "bg-danger text-on-danger border-danger", dot: "bg-danger", text: "text-danger-foreground" },
  LATE: { label: "Late", short: "L", key: "l", icon: Clock3, active: "bg-warning text-[oklch(0.25_0.05_70)] border-warning", dot: "bg-warning", text: "text-warning-foreground" },
  LEAVE: { label: "Leave", short: "Lv", key: "v", icon: Plane, active: "bg-info text-on-info border-info", dot: "bg-info", text: "text-info-foreground" },
  HALF_DAY: { label: "Half day", short: "½", key: "h", icon: Clock3, active: "bg-primary text-primary-foreground border-primary", dot: "bg-primary", text: "text-primary-subtle-foreground" },
};

/** Large, touch-friendly segmented status picker. Each option is labelled with text, not just color. */
export function StatusPicker({
  value,
  onChange,
  options = ["PRESENT", "ABSENT", "LATE", "LEAVE"],
  disabled,
  label,
  compact = false,
  stretch = false,
}: {
  /** Buttons share the full width (phones). */
  stretch?: boolean;
  value: StatusKey | null;
  onChange: (status: StatusKey) => void;
  options?: StatusKey[];
  disabled?: boolean;
  label: string;
  compact?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex gap-1", stretch && "w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none")}>
      {options.map((key) => {
        const meta = STATUS_META[key];
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={meta.label}
            title={`${meta.label} (${meta.key.toUpperCase()})`}
            disabled={disabled}
            tabIndex={selected || (!value && key === options[0]) ? 0 : -1}
            onClick={() => onChange(key)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-[background-color,border-color,color,transform] duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring active:scale-95 disabled:pointer-events-none disabled:opacity-50",
              compact ? "h-9 min-w-9 px-2 text-small" : "h-11 min-w-11 px-2.5 text-small sm:px-3",
              selected ? meta.active : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            <meta.icon className="size-4" aria-hidden />
            <span className={cn(compact ? "sr-only" : "hidden md:inline")}>{meta.label}</span>
            <span aria-hidden className={cn(compact ? "" : "md:hidden")}>{meta.short}</span>
          </button>
        );
      })}
    </div>
  );
}

export function StatusBadge({ status }: { status: StatusKey | null }) {
  if (!status) return <span className="text-small text-muted-foreground">Not marked</span>;
  const meta = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-small font-medium", meta.text)}>
      <span className={cn("size-2 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}
