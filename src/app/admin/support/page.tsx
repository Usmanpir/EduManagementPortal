import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { FilterBar } from "@/components/data/filter-bar";
import { Pagination } from "@/components/data/pagination";
import { CATEGORY_LABELS, PRIORITY_LABELS, TicketStatusBadge } from "@/components/support/ticket-ui";
import { listAllTickets } from "@/server/modules/support/tickets";
import { pagination } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Support" };

const TABS = [
  { key: "", label: "Open" },
  { key: "closed", label: "Resolved & closed" },
  { key: "all", label: "All" },
];

export default async function AdminSupportPage({ searchParams }: PageProps<"/admin/support">) {
  const sp = await searchParams;
  const query = pagination.parse(sp);
  const status = typeof sp.status === "string" ? sp.status : "";
  const { rows, total } = await listAllTickets({ ...query, status });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Support" description="Tickets from schools. Those waiting on us come first, then by priority." />
      <nav aria-label="Status" className="flex gap-1">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key ? `?status=${t.key}` : "?"} aria-current={status === t.key ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 text-small font-medium", status === t.key ? "bg-muted" : "text-muted-foreground hover:bg-muted/60")}>
            {t.label}
          </Link>
        ))}
      </nav>
      <FilterBar searchPlaceholder="Search subject or school" />
      {rows.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="Inbox zero" description="No tickets match." />
      ) : (
        <>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
            {rows.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/support/${t.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  {t.awaitingSupport && <span className="size-2 rounded-full bg-primary" aria-label="Waiting on us" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      #{t.number} {t.subject}
                    </span>
                    <span className="text-caption text-muted-foreground">
                      {t.organization.name} · {CATEGORY_LABELS[t.category] ?? t.category} · <RelativeTime date={t.updatedAt} />
                    </span>
                  </span>
                  {(t.priority === "HIGH" || t.priority === "URGENT") && <Badge variant="danger">{PRIORITY_LABELS[t.priority]}</Badge>}
                  <TicketStatusBadge status={t.status} staffView />
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={query.page} pageSize={query.pageSize} total={total} noun="tickets" />
        </>
      )}
    </div>
  );
}
