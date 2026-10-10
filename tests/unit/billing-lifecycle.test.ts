import { describe, expect, it } from "vitest";
import { nextSubscriptionStatus, trialDaysLeft, type LifecycleInput } from "@/server/modules/billing/lifecycle";

const now = new Date("2026-10-03T00:00:00Z");
const day = (n: number) => new Date(now.getTime() + n * 86_400_000);
const base: LifecycleInput = { status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: day(30), cancelAtPeriodEnd: false, openInvoiceDueDates: [] };
const next = (s: Partial<LifecycleInput>) => nextSubscriptionStatus({ ...base, ...s }, now, 7)?.status ?? null;

describe("subscription lifecycle", () => {
  it("ends trials into a grace period, not straight to read-only", () => {
    expect(next({ status: "TRIALING", trialEndsAt: day(2) })).toBeNull();
    expect(next({ status: "TRIALING", trialEndsAt: day(-1) })).toBe("PAST_DUE");
  });

  it("suspends only after the grace period", () => {
    expect(next({ status: "PAST_DUE", trialEndsAt: day(-5), currentPeriodEnd: day(-5) })).toBeNull();
    expect(next({ status: "PAST_DUE", trialEndsAt: day(-8), currentPeriodEnd: day(-8) })).toBe("SUSPENDED");
    expect(next({ status: "PAST_DUE", openInvoiceDueDates: [day(-10)] })).toBe("SUSPENDED");
  });

  it("flags overdue invoices and lapsed periods on active subscriptions", () => {
    expect(next({})).toBeNull();
    expect(next({ openInvoiceDueDates: [day(3)] })).toBeNull();
    expect(next({ openInvoiceDueDates: [day(-1)] })).toBe("PAST_DUE");
    expect(next({ currentPeriodEnd: day(-1) })).toBe("PAST_DUE");
    expect(next({ currentPeriodEnd: day(-1), cancelAtPeriodEnd: true })).toBe("CANCELED");
  });

  it("never touches suspended or canceled subscriptions (payment is the only way back)", () => {
    expect(next({ status: "SUSPENDED", openInvoiceDueDates: [day(-100)] })).toBeNull();
    expect(next({ status: "CANCELED", currentPeriodEnd: day(-100) })).toBeNull();
  });

  it("counts trial days left, rounding up", () => {
    expect(trialDaysLeft("TRIALING", new Date(now.getTime() + 1.2 * 86_400_000), now)).toBe(2);
    expect(trialDaysLeft("TRIALING", day(-3), now)).toBe(0);
    expect(trialDaysLeft("ACTIVE", day(3), now)).toBeNull();
  });
});
