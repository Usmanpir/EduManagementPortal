import "server-only";
import { db } from "@/server/db/client";
import { logger } from "@/server/logger";
import { getEffectiveLimits, recordUsage } from "@/server/modules/billing/limits";
import { parseOrgSettings } from "@/server/modules/organizations/settings";
import { notifyUsers, type NotificationType } from "./notifications";
import type { TemplateKey } from "./templates";

/** A person to reach: an app user (in-app), and/or contact details for external channels. */
export type Recipient = { userId?: string | null; email?: string | null; phone?: string | null; whatsapp?: string | null };

export type FanoutMessage = {
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  entityType?: string;
  entityId?: string;
  template: TemplateKey;
  payload: Record<string, string | number | null>;
  /** Stable per-event key; the same event never notifies the same person twice. */
  dedupeKey: string;
  /** Restrict external channels for this message (still subject to the organization's enabled channels). */
  channels?: ("EMAIL" | "WHATSAPP" | "SMS")[];
};

/** Monthly external-message quota left for an organization (null = unlimited). */
async function remainingQuota(organizationId: string) {
  const limits = await getEffectiveLimits(organizationId);
  const limit = limits?.limits.notificationsPerMonth;
  if (limit === null || limit === undefined) return null;
  const period = new Date().toISOString().slice(0, 7);
  const row = await db.subscriptionUsage.findUnique({ where: { organizationId_metric_period: { organizationId, metric: "notificationsPerMonth", period } } });
  return Math.max(0, limit - Number(row?.value ?? 0));
}

/**
 * Sends one message to many recipients: in-app for users, plus email /
 * WhatsApp / SMS according to the organization's enabled channels and plan
 * quota. Safe to call repeatedly — dedupe keys make it idempotent.
 */
export async function fanout(organizationId: string, recipients: Recipient[], msg: FanoutMessage) {
  if (recipients.length === 0) return { inApp: 0, external: 0 };
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
  const channels = parseOrgSettings(org?.settings).notifications;

  const userIds = [...new Set(recipients.map((r) => r.userId).filter((x): x is string => !!x))];
  const inApp = await notifyUsers(
    organizationId,
    userIds.map((userId) => ({
      userId,
      type: msg.type,
      title: msg.title,
      body: msg.body,
      link: msg.link,
      entityType: msg.entityType,
      entityId: msg.entityId,
      dedupeKey: msg.dedupeKey,
    })),
  );

  const outbound = externalTargets(recipients, effectiveChannels(channels, msg.channels));
  if (!outbound.length) return { inApp, external: 0 };

  const quota = await remainingQuota(organizationId);
  const allowed = quota === null ? outbound : outbound.slice(0, quota);
  if (allowed.length < outbound.length) logger.warn("notification_quota_exhausted", { organizationId, dedupeKey: msg.dedupeKey, dropped: outbound.length - allowed.length });
  let external = 0;
  // Batched insert into the outbox; duplicates (retries) are skipped by the unique dedupe key.
  for (let i = 0; i < allowed.length; i += 1000) {
    const res = await db.notificationDelivery.createMany({
      data: allowed.slice(i, i + 1000).map((o) => ({
        organizationId,
        channel: o.channel,
        recipient: o.to,
        templateKey: msg.template,
        payload: msg.payload,
        dedupeKey: `${msg.dedupeKey}:${o.channel}:${o.to}`,
      })),
      skipDuplicates: true,
    });
    external += res.count;
  }
  if (external) await recordUsage(organizationId, "notificationsPerMonth", external);
  return { inApp, external };
}

type ChannelFlags = { email: boolean; whatsapp: boolean; sms: boolean };

function effectiveChannels(org: ChannelFlags, only?: ("EMAIL" | "WHATSAPP" | "SMS")[]): ChannelFlags {
  if (!only) return org;
  return { email: org.email && only.includes("EMAIL"), whatsapp: org.whatsapp && only.includes("WHATSAPP"), sms: org.sms && only.includes("SMS") };
}

/** One external message per person per channel: email, plus WhatsApp (or SMS when WhatsApp isn't used). */
export function externalTargets(recipients: Recipient[], channels: ChannelFlags) {
  const outbound: { channel: "EMAIL" | "WHATSAPP" | "SMS"; to: string }[] = [];
  for (const r of recipients) {
    if (channels.email && r.email) outbound.push({ channel: "EMAIL", to: r.email });
    const mobile = r.whatsapp || r.phone;
    if (channels.whatsapp && mobile) outbound.push({ channel: "WHATSAPP", to: mobile });
    else if (channels.sms && r.phone) outbound.push({ channel: "SMS", to: r.phone });
  }
  return [...new Map(outbound.map((o) => [`${o.channel}:${o.to}`, o])).values()];
}

/** Guardians who receive alerts for each student, with their contact details. */
export async function guardianRecipients(organizationId: string, studentIds: string[]) {
  const links = await db.studentGuardian.findMany({
    where: { organizationId, studentId: { in: studentIds }, receivesNotifications: true, guardian: { deletedAt: null } },
    select: { studentId: true, guardian: { select: { userId: true, email: true, phone: true, whatsapp: true } } },
  });
  const map = new Map<string, Recipient[]>();
  for (const l of links) map.set(l.studentId, [...(map.get(l.studentId) ?? []), l.guardian]);
  return map;
}
