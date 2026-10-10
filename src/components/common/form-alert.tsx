import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cn } from "cn";

const VARIANTS = {
  error: { icon: CircleAlert, className: "border-danger/25 bg-danger-subtle text-danger-foreground" },
  success: { icon: CircleCheck, className: "border-success/25 bg-success-subtle text-success-foreground" },
  info: { icon: Info, className: "border-info/25 bg-info-subtle text-info-foreground" },
};

/** Inline message for form-level outcomes (not tied to a single field). */
export function FormAlert({
  variant = "error",
  children,
  action,
  className,
}: {
  variant?: keyof typeof VARIANTS;
  children: React.ReactNode;
  /** e.g. a Retry button, shown at the end of the message. */
  action?: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  const v = VARIANTS[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-small", v.className, className)}
    >
      <v.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="-my-1 shrink-0">{action}</div>}
    </div>
  );
}
