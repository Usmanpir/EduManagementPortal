import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { auditFor } from "@/server/audit";
import { decryptJson, encryptJson, randomToken } from "@/server/auth/crypto";
import type { TenantContext } from "@/server/auth/context";
import { badRequest, notFound } from "@/server/http/errors";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import type { integrationSchema, testMessageSchema } from "@/lib/validation/communication";
import { processDelivery, queueDelivery } from "./delivery";

type WhatsAppConfig = { phoneNumberId: string; accessToken: string };
type SmsConfig = { endpoint: string; apiKey: string; senderId?: string };

/** "EAAG…k9Qz" — enough to recognise a secret, never enough to use it. */
const mask = (secret: string | undefined) => (!secret ? null : secret.length <= 8 ? "••••" : `${secret.slice(0, 4)}…${secret.slice(-4)}`);

async function stored<T>(ctx: TenantContext, provider: string) {
  const row = await ctx.db.integrationCredential.findFirst({ where: { provider } });
  if (!row) return null;
  try {
    return { row, config: decryptJson<T>(row.encryptedConfig) };
  } catch {
    // Unreadable (e.g. the encryption key was rotated): treat as not configured.
    return { row, config: null };
  }
}

/** Integration status for the settings screen. Secrets are only ever returned masked. */
export async function integrationStatus(ctx: TenantContext) {
  const [wa, sms] = await Promise.all([stored<WhatsAppConfig>(ctx, "whatsapp_cloud"), stored<SmsConfig>(ctx, "http_sms")]);
  return {
    email: { provider: env.EMAIL_PROVIDER, ready: env.EMAIL_PROVIDER === "console" || (env.EMAIL_PROVIDER === "resend" && !!env.EMAIL_API_KEY), from: env.EMAIL_FROM },
    whatsapp: {
      configured: !!wa?.config,
      enabled: !!wa?.row.isEnabled,
      platformFallback: !!(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN),
      phoneNumberId: wa?.config?.phoneNumberId ?? "",
      accessToken: mask(wa?.config?.accessToken),
      updatedAt: wa?.row.updatedAt.toISOString() ?? null,
    },
    sms: {
      configured: !!sms?.config,
      enabled: !!sms?.row.isEnabled,
      endpoint: sms?.config?.endpoint ?? "",
      senderId: sms?.config?.senderId ?? "",
      apiKey: mask(sms?.config?.apiKey),
      updatedAt: sms?.row.updatedAt.toISOString() ?? null,
    },
  };
}

/** Saves credentials encrypted at rest. A blank secret keeps the one already stored. */
export async function saveIntegration(ctx: TenantContext, input: z.output<typeof integrationSchema>) {
  let config: WhatsAppConfig | SmsConfig;
  if (input.provider === "whatsapp_cloud") {
    const prev = await stored<WhatsAppConfig>(ctx, input.provider);
    const accessToken = input.config.accessToken || prev?.config?.accessToken || "";
    if (!accessToken) throw badRequest("Enter the access token.", { accessToken: "Required." });
    config = { phoneNumberId: input.config.phoneNumberId, accessToken };
  } else {
    const prev = await stored<SmsConfig>(ctx, input.provider);
    const apiKey = input.config.apiKey || prev?.config?.apiKey || "";
    if (!apiKey) throw badRequest("Enter the API key.", { apiKey: "Required." });
    config = { endpoint: input.config.endpoint, apiKey, senderId: input.config.senderId || undefined };
  }
  const encryptedConfig = encryptJson(config);
  await ctx.db.integrationCredential.upsert({
    where: { organizationId_provider: { organizationId: ctx.orgId, provider: input.provider } },
    create: { organizationId: ctx.orgId, provider: input.provider, encryptedConfig, isEnabled: input.isEnabled },
    update: { encryptedConfig, isEnabled: input.isEnabled },
  });
  // Never put secrets in the audit log.
  await auditFor(ctx)({ action: "integration.update", entityType: "integration", metadata: { provider: input.provider, enabled: input.isEnabled } });
}

export async function removeIntegration(ctx: TenantContext, provider: string) {
  const row = await ctx.db.integrationCredential.findFirst({ where: { provider } });
  if (!row) throw notFound("Integration");
  await ctx.db.integrationCredential.delete({ where: { id: row.id } });
  await auditFor(ctx)({ action: "integration.remove", entityType: "integration", metadata: { provider } });
}

/** Sends one real message now and reports exactly what the provider said. */
export async function sendTestMessage(ctx: TenantContext, input: z.output<typeof testMessageSchema>) {
  const dedupeKey = `test:${ctx.user.id}:${randomToken(8)}`;
  const id = await queueDelivery({
    organizationId: ctx.orgId,
    channel: input.channel,
    recipient: input.to,
    templateKey: "announcement",
    payload: { title: "Test message from EduAttend", body: `This is a test ${input.channel.toLowerCase()} message sent by ${ctx.user.firstName} ${ctx.user.lastName}. If you received it, the integration works.` },
    dedupeKey,
  });
  if (!id) throw badRequest("Couldn't queue the test message.");
  await processDelivery(id);
  const d = await db.notificationDelivery.findUniqueOrThrow({ where: { id } });
  await auditFor(ctx)({ action: "integration.test", entityType: "integration", metadata: { channel: input.channel, status: d.status } });
  return { status: d.status, error: d.lastError, provider: d.provider };
}

export type DeliveryListParams = { status?: string[]; channel?: string[]; page: number; pageSize: number };

/** The outbox: what was sent, skipped or failed, and why. */
export async function listDeliveries(ctx: TenantContext, p: DeliveryListParams) {
  const where: Prisma.NotificationDeliveryWhereInput = {
    organizationId: ctx.orgId,
    ...(p.status?.length ? { status: { in: p.status as never[] } } : {}),
    ...(p.channel?.length ? { channel: { in: p.channel as never[] } } : {}),
  };
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [rows, total, summary] = await Promise.all([
    db.notificationDelivery.findMany({ where, orderBy: { createdAt: "desc" }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
    db.notificationDelivery.count({ where }),
    db.notificationDelivery.groupBy({ by: ["status"], where: { organizationId: ctx.orgId, createdAt: { gte: since } }, _count: true }),
  ]);
  return {
    total,
    summary: Object.fromEntries(summary.map((s) => [s.status, s._count])) as Record<string, number>,
    rows: rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      // Partially hide contact details in the log.
      recipient: r.recipient.includes("@") ? r.recipient.replace(/^(.{2}).*(@.*)$/, "$1•••$2") : r.recipient.replace(/\d(?=\d{3})/g, "•"),
      template: r.templateKey,
      status: r.status,
      attempts: r.attempts,
      error: r.lastError,
      provider: r.provider,
      createdAt: r.createdAt.toISOString(),
      sentAt: r.sentAt?.toISOString() ?? null,
    })),
  };
}

/** Message counts by status over the last 30 days. */
export async function deliverySummary(ctx: TenantContext) {
  const rows = await ctx.db.notificationDelivery.groupBy({ by: ["status"], where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _count: true });
  return Object.fromEntries(rows.map((s) => [s.status, s._count])) as Record<string, number>;
}

/** Puts failed deliveries back in the queue for another try. */
export async function retryFailed(ctx: TenantContext) {
  const res = await db.notificationDelivery.updateMany({ where: { organizationId: ctx.orgId, status: "FAILED" }, data: { status: "PENDING", attempts: 0, scheduledAt: new Date() } });
  await auditFor(ctx)({ action: "deliveries.retry", entityType: "integration", metadata: { count: res.count } });
  return res.count;
}
