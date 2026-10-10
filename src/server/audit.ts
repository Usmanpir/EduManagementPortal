import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { requestMeta } from "@/server/auth/session";
import { logger } from "@/server/logger";

type AuditInput = {
  organizationId: string | null;
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

const SENSITIVE_KEYS = new Set(["passwordHash", "tokenHash", "encryptedConfig"]);

function snapshot(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (SENSITIVE_KEYS.has(key)) return undefined;
      if (typeof v === "bigint") return v.toString();
      return v;
    }),
  ) as Prisma.InputJsonValue;
}

/**
 * Records who did what. Audit failures are logged but never break the user's
 * action — the primary write has already succeeded.
 */
export async function audit(input: AuditInput) {
  try {
    let meta: { ipAddress: string | null; userAgent: string | null } = { ipAddress: null, userAgent: null };
    try {
      meta = await requestMeta();
    } catch {
      // Called outside a request (jobs, scripts).
    }
    await db.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: snapshot(input.before),
        after: snapshot(input.after),
        metadata: snapshot(input.metadata),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
  } catch (error) {
    logger.error("audit_write_failed", { action: input.action, error });
  }
}

/** Convenience wrapper bound to a tenant context. */
export function auditFor(ctx: { orgId: string; user: { id: string } }) {
  return (input: Omit<AuditInput, "organizationId" | "userId">) =>
    audit({ ...input, organizationId: ctx.orgId, userId: ctx.user.id });
}
