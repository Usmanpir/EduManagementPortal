import "server-only";
import { db } from "@/server/db/client";
import { trialDaysLeft } from "./lifecycle";

/** Compact subscription state for the app shell (banner + sidebar trial countdown). */
export async function subscriptionSummary(organizationId: string, now = new Date()) {
  const sub = await db.subscription.findUnique({
    where: { organizationId },
    include: { plan: { select: { name: true } } },
  });
  if (!sub) return null;
  return { status: sub.status, planName: sub.plan.name, trialDaysLeft: trialDaysLeft(sub.status, sub.trialEndsAt, now) };
}
