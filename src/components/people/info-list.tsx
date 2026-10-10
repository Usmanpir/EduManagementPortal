import { cn } from "cn";

export type InfoItem = { label: string; value: React.ReactNode; wide?: boolean };

/** Label/value pairs for profile pages. Empty values render as an em dash. */
export function InfoList({ items, className }: { items: InfoItem[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className={cn("flex min-w-0 flex-col gap-0.5", item.wide && "sm:col-span-2")}>
          <dt className="text-caption text-muted-foreground">{item.label}</dt>
          <dd className="text-small break-words text-foreground">{item.value === null || item.value === undefined || item.value === "" ? <span className="text-subtle-foreground">—</span> : item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProfileCard({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-xs", className)}>
      <header className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <h2 className="text-h3">{title}</h2>
        {action}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
