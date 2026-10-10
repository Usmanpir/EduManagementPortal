import "server-only";
import { db } from "@/server/db/client";
import { AppError } from "@/server/http/errors";

/**
 * Organizations whose subscription is suspended or fully canceled keep read
 * access to their data but cannot make changes until billing is resolved.
 */
export async function assertSubscriptionWritable(organizationId: string) {
  const [org, sub] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { status: true } }),
    db.subscription.findUnique({
      where: { organizationId },
      select: { status: true, currentPeriodEnd: true },
    }),
  ]);
  if (org?.status === "SUSPENDED") {
    throw new AppError("SUBSCRIPTION_INACTIVE", "This organization is suspended. Contact support to restore access.");
  }
  if (!sub) return;
  if (sub.status === "SUSPENDED") {
    throw new AppError(
      "SUBSCRIPTION_INACTIVE",
      "Your subscription is suspended, so EduAttend is read-only. Update billing to continue making changes.",
    );
  }
  if (sub.status === "CANCELED" && sub.currentPeriodEnd < new Date()) {
    throw new AppError(
      "SUBSCRIPTION_INACTIVE",
      "Your subscription has ended, so EduAttend is read-only. Choose a plan to continue making changes.",
    );
  }
}
