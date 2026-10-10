/**
 * Subscription lifecycle rules (pure, no I/O):
 *
 *   TRIALING ─ trial ends ─────────────────▶ PAST_DUE
 *   ACTIVE ─── invoice overdue / period over ▶ PAST_DUE   (cancelAtPeriodEnd ▶ CANCELED)
 *   PAST_DUE ─ unpaid past the grace period ─▶ SUSPENDED  (read-only)
 *
 * Paying an invoice (recorded by platform staff) is the only way back to ACTIVE.
 */
export type LifecycleInput = {
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED";
  trialEndsAt: Date | null;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  /** Due dates of OPEN invoices. */
  openInvoiceDueDates: Date[];
};

const DAY = 86_400_000;

export function nextSubscriptionStatus(s: LifecycleInput, now: Date, graceDays: number): { status: LifecycleInput["status"]; reason: string } | null {
  const overdue = s.openInvoiceDueDates.filter((d) => d < now).sort((a, b) => a.getTime() - b.getTime());
  switch (s.status) {
    case "TRIALING":
      if (s.trialEndsAt && s.trialEndsAt <= now) return { status: "PAST_DUE", reason: "trial_ended" };
      return null;
    case "ACTIVE":
      if (s.currentPeriodEnd <= now && s.cancelAtPeriodEnd) return { status: "CANCELED", reason: "canceled_at_period_end" };
      if (overdue.length) return { status: "PAST_DUE", reason: "invoice_overdue" };
      if (s.currentPeriodEnd <= now) return { status: "PAST_DUE", reason: "period_ended" };
      return null;
    case "PAST_DUE": {
      // Grace runs from the earliest of: oldest overdue invoice, trial end, period end.
      const since = [overdue[0], s.trialEndsAt, s.currentPeriodEnd].filter((d): d is Date => !!d && d <= now).sort((a, b) => a.getTime() - b.getTime())[0];
      if (since && now.getTime() - since.getTime() > graceDays * DAY) return { status: "SUSPENDED", reason: "grace_period_over" };
      return null;
    }
    default:
      return null;
  }
}

/** Days left in a trial, rounded up; null when not trialing. */
export function trialDaysLeft(status: string, trialEndsAt: Date | null, now: Date) {
  return status === "TRIALING" && trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY)) : null;
}
