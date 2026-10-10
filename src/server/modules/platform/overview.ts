import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";

/** Monthly recurring revenue from active subscriptions (yearly plans spread over 12 months). */
function monthlyValue(sub: { billingCycle: string; customPrice: Prisma.Decimal | null; plan: { priceMonthly: Prisma.Decimal; priceYearly: Prisma.Decimal } }) {
  if (sub.customPrice) return sub.billingCycle === "YEARLY" ? Number(sub.customPrice) / 12 : Number(sub.customPrice);
  return sub.billingCycle === "YEARLY" ? Number(sub.plan.priceYearly) / 12 : Number(sub.plan.priceMonthly);
}

export async function platformOverview() {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [orgs, suspendedOrgs, newOrgs, subsByStatus, activeSubs, students, users, staff] = await Promise.all([
    db.organization.count({ where: { deletedAt: null } }),
    db.organization.count({ where: { deletedAt: null, status: "SUSPENDED" } }),
    db.organization.count({ where: { deletedAt: null, createdAt: { gte: since } } }),
    db.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    db.subscription.findMany({ where: { status: "ACTIVE" }, select: { billingCycle: true, customPrice: true, plan: { select: { priceMonthly: true, priceYearly: true, currency: true } } } }),
    db.student.count({ where: { archivedAt: null, status: "ACTIVE" } }),
    db.user.count({ where: { deletedAt: null, isSuperAdmin: false } }),
    db.staff.count({ where: { deletedAt: null } }),
  ]);
  const byStatus = Object.fromEntries(subsByStatus.map((s) => [s.status, s._count._all])) as Record<string, number>;
  return {
    organizations: orgs,
    suspendedOrganizations: suspendedOrgs,
    newOrganizations: newOrgs,
    active: byStatus.ACTIVE ?? 0,
    trialing: byStatus.TRIALING ?? 0,
    pastDue: byStatus.PAST_DUE ?? 0,
    canceled: (byStatus.CANCELED ?? 0) + (byStatus.SUSPENDED ?? 0),
    mrr: activeSubs.reduce((sum, s) => sum + monthlyValue(s), 0),
    currency: activeSubs[0]?.plan.currency ?? "PKR",
    students,
    users,
    staff,
  };
}

export async function listOrganizations(params: { q?: string; page: number; pageSize: number }) {
  const where: Prisma.OrganizationWhereInput = {
    deletedAt: null,
    ...(params.q ? { OR: [{ name: { contains: params.q, mode: "insensitive" } }, { slug: { contains: params.q, mode: "insensitive" } }, { email: { contains: params.q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        id: true,
        name: true,
        slug: true,
        country: true,
        status: true,
        createdAt: true,
        subscription: { select: { status: true, trialEndsAt: true, plan: { select: { name: true } } } },
        _count: {
          select: {
            campuses: { where: { deletedAt: null } },
            students: { where: { archivedAt: null, status: "ACTIVE" } },
            users: { where: { deletedAt: null } },
          },
        },
      },
    }),
    db.organization.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      country: o.country,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      plan: o.subscription?.plan.name ?? null,
      subscriptionStatus: o.subscription?.status ?? null,
      trialEndsAt: o.subscription?.trialEndsAt?.toISOString() ?? null,
      campuses: o._count.campuses,
      students: o._count.students,
      users: o._count.users,
    })),
  };
}
