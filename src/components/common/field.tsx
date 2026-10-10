import * as React from "react";
import { cn } from "cn";
import { Label } from "@/components/ui/label";

type FieldProps = {
  label: React.ReactNode;
  htmlFor: string;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  /** Content aligned to the right of the label (e.g. "Forgot password?"). */
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

/** Label + control + hint/error, wired for screen readers via aria-describedby. */
export function Field({ label, htmlFor, error, hint, required, aside, className, children }: FieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  const control = React.isValidElement<Record<string, unknown>>(children)
    ? React.cloneElement(children, {
        id: (children.props.id as string | undefined) ?? htmlFor,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
        "aria-required": required || undefined,
      })
    : children;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-small font-medium text-foreground">
          {label}
          {required && (
            <span aria-hidden className="text-danger">
              *
            </span>
          )}
        </Label>
        {aside}
      </div>
      {control}
      {error ? (
        <p id={errorId} role="alert" className="text-caption font-medium text-danger-foreground">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Titled group of fields inside a form. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex min-w-0 flex-col gap-4", className)}>
      <legend className="contents">
        <span className="block text-h3 text-foreground">{title}</span>
        {description && <span className="-mt-3 block text-small text-muted-foreground">{description}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

/** Responsive two-column row for short fields. */
export function FieldRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", className)}>{children}</div>;
}
