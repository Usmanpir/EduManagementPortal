import type { Metadata } from "next";
import Link from "next/link";
import { Building } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { FilterBar } from "@/components/data/filter-bar";
import { Pagination } from "@/components/data/pagination";
import { listOrganizations } from "@/server/modules/platform/overview";
import { pagination } from "@/lib/validation/common";
import { formatDate, formatNumber } from "@/lib/format";
import { SUBSCRIPTION_BADGE } from "../subscription-badge";

export const metadata: Metadata = { title: "Organizations" };

export default async function AdminOrganizationsPage({ searchParams }: PageProps<"/admin/organizations">) {
  const query = pagination.parse(await searchParams);
  const { rows, total } = await listOrganizations(query);

  return (
    <div>
      <PageHeader title="Organizations" description="Institutions on EduAttend with their plan, status and size." />
      <FilterBar searchPlaceholder="Search by name, slug or email" />
      {rows.length === 0 ? (
        <EmptyState icon={Building} title="No organizations found" description="Try a different search." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
            <table className="w-full text-small">
              <caption className="sr-only">Organizations</caption>
              <thead className="bg-muted/60">
                <tr className="border-b">
                  {["Organization", "Plan", "Subscription", "Campuses", "Students", "Users", "Joined"].map((h, i) => (
                    <th key={h} scope="col" className={`h-10 px-4 text-caption font-medium whitespace-nowrap text-muted-foreground ${i >= 3 && i <= 5 ? "text-end" : "text-start"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const sub = o.subscriptionStatus ? SUBSCRIPTION_BADGE[o.subscriptionStatus] : null;
                  return (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`/admin/organizations/${o.id}`} className="font-medium hover:text-primary hover:underline">
                          {o.name}
                        </Link>
                        <p className="font-mono text-caption text-muted-foreground">
                          {o.slug} · {o.country}
                          {o.status === "SUSPENDED" && <Badge variant="danger" className="ms-2">Suspended</Badge>}
                        </p>
                      </td>
                      <td className="px-4 py-3">{o.plan ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-3">
                        {sub ? (
                          <Badge variant={sub.variant} dot>
                            {sub.label}
                            {o.subscriptionStatus === "TRIALING" && o.trialEndsAt ? ` · ends ${formatDate(o.trialEndsAt.slice(0, 10), "dayMonth")}` : ""}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end tabular">{o.campuses}</td>
                      <td className="px-4 py-3 text-end tabular">{formatNumber(o.students)}</td>
                      <td className="px-4 py-3 text-end tabular">{formatNumber(o.users)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDate(o.createdAt.slice(0, 10))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={query.page} pageSize={query.pageSize} total={total} noun="organizations" />
        </>
      )}
    </div>
  );
}
