import "server-only";
import { audit } from "@/server/audit";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { nextSubscriptionStatus, trialDaysLeft } from "@/server/modules/billing/lifecycle";
import { notifyUsers, usersWithPermission } from "@/server/modules/communication/notifications";
import type { PlatformTask } from "../types";

const MESSAGES: Record<string, { title: string; body: (grace: number) => string }> = {
  trial_ended: { title: "Your free trial has ended", body: (g) => `Choose a plan within ${g} days to keep making changes. Your data stays safe either way.` },
  invoice_overdue: { title: "Your EduAttend invoice is overdue", body: (g) => `Please pay within ${g} days to avoid your account becoming read-only.` },
  period_ended: { title: "Your subscription period has ended", body: (g) => `Renew within ${g} days to keep making changes.` },
  grace_period_over: { title: "EduAttend is now read-only", body: () => "Your account is suspended until billing is settled. All your data is kept; contact us to restore access." },
  canceled_at_period_end: { title: "Your subscription has ended", body: () => "As requested, your subscription ended. Your data is kept read-only; choose a plan any time to continue." },
};

/** Daily: moves subscriptions through trial → past due → suspended, and warns before trials end. */
export const subscriptionLifecycle: PlatformTask = {
  name: "subscription-lifecycle",
  async run(now) {
    const grace = env.BILLING_GRACE_DAYS;
    const subs = await db.subscription.findMany({
      where: { status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] }, organization: { deletedAt: null } },
      include: { invoices: { where: { status: "OPEN" }, select: { dueAt: true } } },
    });
    const today = now.toISOString().slice(0, 10);
    for (const s of subs) {
      const admins = () => usersWithPermission(s.organizationId, ["billing.view"]);
      const left = trialDaysLeft(s.status, s.trialEndsAt, now);
      if (left !== null && left > 0 && left <= 3) {
        await notifyUsers(
          s.organizationId,
          (await admins()).map((userId) => ({ userId, type: "system", title: `Your trial ends in ${left} day${left === 1 ? "" : "s"}`, body: "Choose a plan on the billing page to keep everything running.", link: "/settings/billing", dedupeKey: `trial-ending:${s.id}:${today}` })),
        );
      }
      const next = nextSubscriptionStatus({ status: s.status, trialEndsAt: s.trialEndsAt, currentPeriodEnd: s.currentPeriodEnd, cancelAtPeriodEnd: s.cancelAtPeriodEnd, openInvoiceDueDates: s.invoices.map((i) => i.dueAt) }, now, grace);
      if (!next) continue;
      // Conditional update: a concurrent change (e.g. a payment just recorded) wins.
      const res = await db.subscription.updateMany({ where: { id: s.id, status: s.status }, data: { status: next.status, ...(next.status === "CANCELED" ? { canceledAt: now } : {}) } });
      if (!res.count) continue;
      await audit({ organizationId: s.organizationId, userId: null, action: "platform.subscription_auto", entityType: "subscription", entityId: s.id, before: { status: s.status }, after: { status: next.status }, metadata: { reason: next.reason } });
      const msg = MESSAGES[next.reason];
      if (msg) {
        await notifyUsers(s.organizationId, (await admins()).map((userId) => ({ userId, type: "system", title: msg.title, body: msg.body(grace), link: "/settings/billing", dedupeKey: `sub:${s.id}:${next.status}:${today}` })));
      }
    }
  },
};
