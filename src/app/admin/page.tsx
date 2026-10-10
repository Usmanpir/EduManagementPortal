import type { Metadata } from "next";
import Link from "next/link";
import { Building, CircleDollarSign, Clock3, GraduationCap, TriangleAlert, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { listOrganizations, platformOverview } from "@/server/modules/platform/overview";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { SUBSCRIPTION_BADGE } from "./subscription-badge";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  const [stats, recent] = await Promise.all([platformOverview(), listOrganizations({ page: 1, pageSize: 6 })]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Platform overview" description="Every institution using EduAttend, their subscriptions and usage." />

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Organizations" value={formatNumber(stats.organizations)} hint={`${stats.newOrganizations} new in 30 days`} icon={Building} tone="primary" href="/admin/organizations" />
        <StatCard label="MRR" value={formatMoney(stats.mrr, stats.currency, { compact: true })} hint={`${stats.active} active subscriptions`} icon={CircleDollarSign} tone="success" />
        <StatCard label="On trial" value={formatNumber(stats.trialing)} icon={Clock3} tone="info" />
        <StatCard label="Past due" value={formatNumber(stats.pastDue)} hint={stats.suspendedOrganizations ? `${stats.suspendedOrganizations} suspended` : undefined} icon={TriangleAlert} tone={stats.pastDue ? "danger" : "neutral"} />
        <StatCard label="Active students" value={formatNumber(stats.students)} icon={GraduationCap} tone="neutral" />
        <StatCard label="Users" value={formatNumber(stats.users)} hint={`${formatNumber(stats.staff)} staff records`} icon={Users} tone="neutral" />
      </section>

      <section aria-labelledby="recent-orgs">
        <SectionHeader
          title={<span id="recent-orgs">Newest organizations</span>}
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/organizations">View all</Link>
            </Button>
          }
        />
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {recent.rows.map((o) => {
            const sub = o.subscriptionStatus ? SUBSCRIPTION_BADGE[o.subscriptionStatus] : null;
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{o.name}</p>
                  <p className="text-caption text-muted-foreground">
                    {o.plan ?? "No plan"} · {o.campuses} campuses · {formatNumber(o.students)} students · joined {formatDate(o.createdAt.slice(0, 10))}
                  </p>
                </div>
                {sub && <Badge variant={sub.variant} dot>{sub.label}</Badge>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
