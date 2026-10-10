import "server-only";
import { db } from "@/server/db/client";
import { logger } from "@/server/logger";
import { processPendingDeliveries } from "@/server/modules/communication/delivery";
import { parseOrgSettings } from "@/server/modules/organizations/settings";
import { hourIn, todayIn } from "@/lib/format";
import { runOnce } from "./claim";
import { dailySummary, lowAttendanceAlerts } from "./tasks/attendance";
import { subscriptionLifecycle } from "./tasks/billing";
import { feeReminders, overdueInvoices } from "./tasks/finance";
import type { OrgTask, PlatformTask } from "./types";

/** Every scheduled task. */
export const ORG_TASKS: OrgTask[] = [overdueInvoices, feeReminders, lowAttendanceAlerts, dailySummary];
export const PLATFORM_TASKS: PlatformTask[] = [subscriptionLifecycle];


/**
 * One scheduler tick (call every minute or so from the worker or cron route):
 * sends queued messages, then runs each due daily task once per organization.
 */
export async function tick(now = new Date()) {
  const summary: Record<string, number> = { deliveries: 0, completed: 0, failed: 0 };
  summary.deliveries = await processPendingDeliveries(100);

  const today = now.toISOString().slice(0, 10);
  for (const task of PLATFORM_TASKS) {
    const r = await runOnce(task.name, `${task.name}:${today}`, () => task.run(now));
    if (r !== "skipped") summary[r === "completed" ? "completed" : "failed"]!++;
  }

  const orgs = await db.organization.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: { id: true, name: true, timezone: true, currency: true, settings: true },
  });
  for (const org of orgs) {
    const local = todayIn(org.timezone, now);
    const hour = hourIn(org.timezone, now);
    const settings = parseOrgSettings(org.settings);
    for (const task of ORG_TASKS) {
      if (hour < task.hour) continue;
      const r = await runOnce(task.name, `${task.name}:${org.id}:${local}`, () => task.run({ org, settings, today: local, now }));
      if (r !== "skipped") summary[r === "completed" ? "completed" : "failed"]!++;
    }
  }
  logger.info("scheduler_tick", summary);
  return summary;
}
