import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { TicketStatusBadge } from "@/components/support/ticket-ui";
import { AppError } from "@/server/http/errors";
import { organizationDetail } from "@/server/modules/platform/billing";
import { formatDate, formatNumber } from "@/lib/format";
import { SUBSCRIPTION_BADGE } from "../../subscription-badge";
import { InvoicesPanel, OrgStatusControl, SubscriptionForm } from "./org-admin-client";

export const metadata: Metadata = { title: "Organization" };

const LABELS: Record<string, string> = { students: "Students", teachers: "Teachers", staff: "Staff", campuses: "Campuses", storageMb: "Storage (MB)", notificationsPerMonth: "Messages / month", apiRequestsPerDay: "API requests / day" };

export default async function AdminOrganizationPage({ params }: PageProps<"/admin/organizations/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await organizationDetail(id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!d) notFound();
  const sub = d.subscription;
  const badge = sub ? SUBSCRIPTION_BADGE[sub.status] : null;

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="-ms-2 self-start">
        <Link href="/admin/organizations">
          <ArrowLeft /> Organizations
        </Link>
      </Button>
      <PageHeader
        title={d.org.name}
        eyebrow={
          <span className="flex gap-2">
            {badge && (
              <Badge variant={badge.variant} dot>
                {sub!.planName} · {badge.label}
              </Badge>
            )}
            {d.org.status === "SUSPENDED" && <Badge variant="danger">Organization suspended</Badge>}
          </span>
        }
        description={`${d.org.slug} · ${d.org.country} · joined ${formatDate(d.org.createdAt.slice(0, 10), "long")}${d.org.email ? ` · ${d.org.email}` : ""}`}
        actions={<OrgStatusControl orgId={d.org.id} status={d.org.status} />}
      />

      <section className="rounded-xl border bg-card p-5 shadow-xs" aria-labelledby="usage-h">
        <h2 id="usage-h" className="mb-3 text-h3">
          Usage vs limits
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {d.usage.map((u) => {
            const over = u.limit !== null && u.used > u.limit;
            return (
              <div key={u.key} className={`rounded-lg border p-3 ${over ? "border-danger/40 bg-danger-subtle/40" : ""}`}>
                <dt className="text-caption text-muted-foreground">{LABELS[u.key]}</dt>
                <dd className="tabular">
                  <span className="text-h3">{formatNumber(u.used)}</span>
                  <span className="text-small text-muted-foreground"> / {u.limit === null ? "∞" : formatNumber(u.limit)}</span>
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {sub ? <SubscriptionForm orgId={d.org.id} sub={sub} plans={d.plans} /> : <p className="text-small text-muted-foreground">No subscription.</p>}
        <InvoicesPanel orgId={d.org.id} invoices={d.invoices} currency={sub?.currency ?? "PKR"} suggested={sub ? { amount: sub.customPrice ?? sub.listPrice, cycle: sub.billingCycle } : null} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="rounded-xl border bg-card p-5 shadow-xs">
          <h2 className="mb-3 text-h3">Administrators</h2>
          <ul className="flex flex-col gap-2 text-small">
            {d.admins.map((a) => (
              <li key={a.id}>
                <p className="font-medium">{a.name}</p>
                <p className="text-caption text-muted-foreground">
                  {a.email} · {a.lastLoginAt ? <>last seen <RelativeTime date={a.lastLoginAt} /></> : "never signed in"}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-caption text-muted-foreground">Campuses: {d.org.campuses.map((c) => c.name).join(", ") || "—"}</p>
        </section>
        <section className="rounded-xl border bg-card p-5 shadow-xs">
          <h2 className="mb-3 text-h3">Support</h2>
          {d.tickets.length === 0 ? (
            <p className="text-small text-muted-foreground">No tickets.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {d.tickets.map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/support/${t.id}`} className="flex items-center justify-between gap-2 text-small hover:underline">
                    <span className="truncate">
                      #{t.number} {t.subject}
                    </span>
                    <TicketStatusBadge status={t.status} staffView />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border bg-card p-5 shadow-xs">
          <h2 className="mb-3 text-h3">Platform activity</h2>
          {d.activity.length === 0 ? (
            <p className="text-small text-muted-foreground">No platform changes yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-small">
              {d.activity.map((a) => (
                <li key={a.id}>
                  <p className="font-medium">{a.action.replace("platform.", "").replaceAll("_", " ")}</p>
                  <p className="text-caption text-muted-foreground">
                    <RelativeTime date={a.createdAt} />
                    {a.metadata && typeof a.metadata.reason === "string" ? ` · ${a.metadata.reason}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
