import { LogoMark } from "@/components/brand/logo";

/** Letterhead used on printable documents. */
export function PrintHeader({ organization, title, subtitle, meta }: { organization: { name: string; address?: string | null; phone?: string | null; email?: string | null }; title: string; subtitle?: string; meta?: React.ReactNode }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-6 border-b pb-5">
      <div className="flex items-start gap-3">
        <LogoMark className="size-10" />
        <div>
          <p className="text-h2">{organization.name}</p>
          <p className="text-caption text-muted-foreground">{[organization.address, organization.phone, organization.email].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <div className="text-end">
        <p className="text-h1">{title}</p>
        {subtitle && <p className="text-small text-muted-foreground">{subtitle}</p>}
        {meta}
      </div>
    </header>
  );
}
