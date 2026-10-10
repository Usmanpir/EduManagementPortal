import { cn } from "cn";

/** A titled block of settings with an optional footer for the save action. */
export function SettingsCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-xs", className)}>
      <header className="flex flex-col gap-0.5 border-b px-5 py-4">
        <h2 className="text-h3">{title}</h2>
        {description && <p className="text-small text-muted-foreground">{description}</p>}
      </header>
      <div className="px-5 py-5">{children}</div>
      {footer && <footer className="flex items-center justify-end gap-2 rounded-b-xl border-t bg-muted/30 px-5 py-3">{footer}</footer>}
    </section>
  );
}
