import "server-only";
import { db } from "@/server/db/client";
import { logger } from "@/server/logger";
import { parseOrgSettings } from "@/server/modules/organizations/settings";
import type { NotificationChannel } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { renderTemplate, type TemplateKey } from "./templates";
import { ProviderNotConfiguredError, resolveProvider } from "./providers";

const MAX_ATTEMPTS = 5;

export type QueueInput = {
  organizationId: string | null;
  channel: Exclude<NotificationChannel, "IN_APP">;
  recipient: string;
  templateKey: TemplateKey;
  payload: Record<string, string | number | null>;
  /** Same key = same message; re-queueing is a no-op (retry-safe). */
  dedupeKey: string;
};

/** Adds a message to the outbox. Returns the delivery id, or null when it was already queued. */
export async function queueDelivery(input: QueueInput): Promise<string | null> {
  const result = await db.notificationDelivery.createMany({
    data: [
      {
        organizationId: input.organizationId,
        channel: input.channel,
        recipient: input.recipient,
        templateKey: input.templateKey,
        payload: input.payload as Prisma.InputJsonValue,
        dedupeKey: input.dedupeKey,
      },
    ],
    skipDuplicates: true,
  });
  if (result.count === 0) return null;
  const row = await db.notificationDelivery.findUnique({ where: { dedupeKey: input.dedupeKey }, select: { id: true } });
  return row?.id ?? null;
}

/** Queues and attempts delivery immediately (used for time-sensitive email like password resets). */
export async function sendNow(input: QueueInput) {
  const id = await queueDelivery(input);
  if (id) await processDelivery(id);
}

/** Attempts one delivery. Safe to call concurrently — a delivery is claimed before sending. */
export async function processDelivery(id: string) {
  // Claim: bump attempts only if still pending. Losing the race means another worker has it.
  const claimed = await db.notificationDelivery.updateMany({
    where: { id, status: "PENDING", attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 }, scheduledAt: new Date(Date.now() + 5 * 60 * 1000) },
  });
  if (claimed.count === 0) return;

  const delivery = await db.notificationDelivery.findUniqueOrThrow({ where: { id } });
  try {
    const org = delivery.organizationId
      ? await db.organization.findUnique({ where: { id: delivery.organizationId } })
      : null;

    if (org) {
      const settings = parseOrgSettings(org.settings);
      const enabled =
        delivery.channel === "EMAIL" ? settings.notifications.email
        : delivery.channel === "SMS" ? settings.notifications.sms
        : delivery.channel === "WHATSAPP" ? settings.notifications.whatsapp
        : true;
      // Account emails (reset/invite/welcome) are always sent regardless of org preferences.
      const essential = ["password_reset", "invitation", "welcome"].includes(delivery.templateKey);
      if (!enabled && !essential) {
        await db.notificationDelivery.update({ where: { id }, data: { status: "SKIPPED", lastError: "Channel disabled by organization" } });
        return;
      }
    }

    const provider = await resolveProvider(delivery.channel, delivery.organizationId);
    const settings = org ? parseOrgSettings(org.settings) : null;
    const rendered = renderTemplate(
      delivery.templateKey as TemplateKey,
      { organizationName: org?.name ?? "EduAttend", ...(delivery.payload as Record<string, string | number | null>) },
      { name: org?.name, color: org?.primaryColor ?? undefined, footer: settings?.branding.emailFooter },
    );
    const result = await provider.send({ to: delivery.recipient, rendered });
    await db.notificationDelivery.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date(), provider: provider.name, providerMessageId: result.providerMessageId, lastError: null },
    });
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      await db.notificationDelivery.update({ where: { id }, data: { status: "SKIPPED", lastError: error.message } });
      return;
    }
    const exhausted = delivery.attempts >= MAX_ATTEMPTS;
    // Exponential backoff: 1, 2, 4, 8 minutes.
    const backoffMs = Math.min(2 ** (delivery.attempts - 1), 30) * 60 * 1000;
    await db.notificationDelivery.update({
      where: { id },
      data: {
        status: exhausted ? "FAILED" : "PENDING",
        scheduledAt: new Date(Date.now() + backoffMs),
        lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
      },
    });
    logger.warn("delivery_failed", { id, channel: delivery.channel, attempt: delivery.attempts, exhausted });
  }
}

/** Processes due deliveries in small batches. Called by the job worker. */
export async function processPendingDeliveries(limit = 50) {
  const due = await db.notificationDelivery.findMany({
    where: { status: "PENDING", scheduledAt: { lte: new Date() }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const { id } of due) await processDelivery(id);
  return due.length;
}
