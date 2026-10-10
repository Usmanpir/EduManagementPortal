import "server-only";
import { db } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
import type { PlanLimits } from "./catalog";

export type LimitMetric = keyof PlanLimits;

const LABELS: Record<LimitMetric, (n: number) => string> = {
  students: (n) => `${n.toLocaleString()} students`,
  teachers: (n) => `${n.toLocaleString()} teachers`,
  staff: (n) => `${n.toLocaleString()} staff members`,
  campuses: (n) => (n === 1 ? "1 campus" : `${n} campuses`),
  storageMb: (n) => (n >= 1024 ? `${(n / 1024).toFixed(0)} GB of storage` : `${n} MB of storage`),
  notificationsPerMonth: (n) => `${n.toLocaleString()} notifications per month`,
  apiRequestsPerDay: (n) => `${n.toLocaleString()} API requests per day`,
};

/** Plan limits with any enterprise overrides applied. `null` = unlimited. */
export async function getEffectiveLimits(organizationId: string): Promise<{ planName: string; limits: PlanLimits } | null> {
  const sub = await db.subscription.findUnique({ where: { organizationId }, include: { plan: true } });
  if (!sub) return null;
  const limits = { ...(sub.plan.limits as PlanLimits), ...((sub.customLimits as Partial<PlanLimits> | null) ?? {}) };
  return { planName: sub.plan.name, limits };
}

export async function currentUsage(organizationId: string, metric: LimitMetric): Promise<number> {
  const now = new Date();
  switch (metric) {
    case "students":
      return db.student.count({ where: { organizationId, archivedAt: null, status: "ACTIVE" } });
    case "teachers":
      return db.teacher.count({ where: { organizationId, staff: { deletedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } } } });
    case "staff":
      return db.staff.count({ where: { organizationId, deletedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } } });
    case "campuses":
      return db.campus.count({ where: { organizationId, deletedAt: null } });
    case "storageMb": {
      const agg = await db.document.aggregate({ where: { organizationId, archivedAt: null }, _sum: { sizeBytes: true } });
      return Math.ceil((agg._sum.sizeBytes ?? 0) / (1024 * 1024));
    }
    case "notificationsPerMonth": {
      const period = now.toISOString().slice(0, 7);
      const row = await db.subscriptionUsage.findUnique({ where: { organizationId_metric_period: { organizationId, metric, period } } });
      return Number(row?.value ?? 0);
    }
    case "apiRequestsPerDay": {
      const period = now.toISOString().slice(0, 10);
      const row = await db.subscriptionUsage.findUnique({ where: { organizationId_metric_period: { organizationId, metric, period } } });
      return Number(row?.value ?? 0);
    }
  }
}

/**
 * Throws PLAN_LIMIT_REACHED when adding `adding` more units would exceed the
 * plan. Limits are read from the database (plan + overrides), never hard-coded.
 */
export async function assertWithinLimit(organizationId: string, metric: LimitMetric, adding = 1) {
  const effective = await getEffectiveLimits(organizationId);
  if (!effective) return;
  const limit = effective.limits[metric];
  if (limit === null || limit === undefined) return;
  const used = await currentUsage(organizationId, metric);
  if (used + adding > limit) {
    throw new AppError(
      "PLAN_LIMIT_REACHED",
      `Your ${effective.planName} plan includes up to ${LABELS[metric](limit)}${used > 0 ? ` and you're using ${used.toLocaleString()}` : ""}. Upgrade your plan to add more.`,
    );
  }
}

/** Atomically adds to a metered usage counter (notifications, API calls). */
export async function recordUsage(organizationId: string, metric: "notificationsPerMonth" | "apiRequestsPerDay" | string, amount = 1) {
  const now = new Date();
  const period = metric === "apiRequestsPerDay" ? now.toISOString().slice(0, 10) : now.toISOString().slice(0, 7);
  await db.subscriptionUsage.upsert({
    where: { organizationId_metric_period: { organizationId, metric, period } },
    create: { organizationId, metric, period, value: amount },
    update: { value: { increment: amount } },
  });
}
