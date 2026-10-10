import "server-only";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { audit } from "@/server/audit";
import { AppError, conflict } from "@/server/http/errors";
import { burnPasswordCheck, hashPassword, hashToken, randomToken, verifyPassword } from "@/server/auth/crypto";
import { createSession, destroyAllSessions, destroySession, getSession } from "@/server/auth/session";
import { provisionOrganization } from "@/server/modules/organizations/provision";
import { queueDelivery, sendNow } from "@/server/modules/communication/delivery";
import { assertUnderLimit, clearRateLimit, enforceRateLimit, hitRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import type { z } from "zod";
import type { loginSchema, registerSchema } from "@/lib/validation/auth";

const INVALID_LOGIN = "That email and password combination didn't work.";
const RESET_TTL_MS = 60 * 60 * 1000;

/** Where a user lands after signing in. */
export function homePathFor(user: { isSuperAdmin: boolean }) {
  return user.isSuperAdmin ? "/admin" : "/dashboard";
}

export async function register(input: z.output<typeof registerSchema>, ip: string) {
  await enforceRateLimit(`register:${ip}`, RATE_LIMITS.register);

  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    throw conflict("An account with this email already exists.", { email: "An account with this email already exists." });
  }

  const passwordHash = await hashPassword(input.password);
  const { organization, user } = await provisionOrganization({
    organizationName: input.organizationName,
    country: input.country,
    admin: { firstName: input.firstName, lastName: input.lastName, email: input.email, passwordHash },
  });

  await createSession(user.id, { remember: true });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ organizationId: organization.id, userId: user.id, action: "organization.register", entityType: "organization", entityId: organization.id });
  await queueDelivery({
    organizationId: organization.id,
    channel: "EMAIL",
    recipient: user.email,
    templateKey: "welcome",
    payload: { firstName: user.firstName, url: `${env.APP_URL}/onboarding` },
    dedupeKey: `welcome:${user.id}`,
  });

  return { redirectTo: "/onboarding" };
}

export async function login(input: z.output<typeof loginSchema>, ip: string) {
  // Only failures are counted, so many staff signing in from one school network is never throttled.
  const ipKey = `login-fail:ip:${ip}`;
  const emailKey = `login-fail:email:${input.email}`;
  await assertUnderLimit(ipKey, RATE_LIMITS.loginFailuresPerIp);
  await assertUnderLimit(emailKey, RATE_LIMITS.loginFailuresPerEmail, "Too many failed attempts for this account. Please wait 15 minutes or reset your password.");

  const fail = async () => {
    await Promise.all([hitRateLimit(ipKey, RATE_LIMITS.loginFailuresPerIp), hitRateLimit(emailKey, RATE_LIMITS.loginFailuresPerEmail)]);
    throw new AppError("UNAUTHORIZED", INVALID_LOGIN);
  };

  const user = await db.user.findUnique({ where: { email: input.email } });
  if (!user || !user.passwordHash || user.deletedAt) {
    await burnPasswordCheck(input.password);
    return fail();
  }
  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    await audit({ organizationId: user.organizationId, userId: user.id, action: "auth.login_failed", entityType: "user", entityId: user.id });
    return fail();
  }
  await clearRateLimit(emailKey);
  if (user.status === "DISABLED") {
    throw new AppError("FORBIDDEN", "Your account has been disabled. Contact your school administrator.");
  }
  if (user.organizationId) {
    const org = await db.organization.findUnique({ where: { id: user.organizationId }, select: { status: true, deletedAt: true } });
    if (!org || org.deletedAt) throw new AppError("UNAUTHORIZED", INVALID_LOGIN);
  }

  await createSession(user.id, { remember: input.remember });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), status: "ACTIVE" } });
  await audit({ organizationId: user.organizationId, userId: user.id, action: "auth.login", entityType: "user", entityId: user.id });

  return { redirectTo: homePathFor(user) };
}

export async function logout() {
  const session = await getSession();
  if (session) {
    await audit({
      organizationId: session.user.organizationId,
      userId: session.userId,
      action: "auth.logout",
      entityType: "user",
      entityId: session.userId,
    });
  }
  await destroySession();
}

/** Always responds the same way so the endpoint can't be used to discover accounts. */
export async function requestPasswordReset(email: string, ip: string) {
  await enforceRateLimit(`reset:ip:${ip}`, RATE_LIMITS.passwordReset);
  await enforceRateLimit(`reset:email:${email}`, RATE_LIMITS.passwordReset);

  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.deletedAt || user.status === "DISABLED") return;

  const token = randomToken();
  const record = await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  await sendNow({
    organizationId: user.organizationId,
    channel: "EMAIL",
    recipient: user.email,
    templateKey: "password_reset",
    payload: { url: `${env.APP_URL}/reset-password/${token}` },
    dedupeKey: `password_reset:${record.id}`,
  });
}

export async function resetPassword(token: string, password: string) {
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError("BAD_REQUEST", "This reset link is invalid or has expired. Request a new one.");
  }

  const passwordHash = await hashPassword(password);
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Invalidate any other outstanding reset links.
    db.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  // Every existing session is revoked after a password change.
  await destroyAllSessions(record.userId);
  await audit({
    organizationId: record.user.organizationId,
    userId: record.userId,
    action: "auth.password_reset",
    entityType: "user",
    entityId: record.userId,
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string, keepTokenHash: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AppError("VALIDATION_ERROR", "Current password is incorrect.", { currentPassword: "Current password is incorrect." });
  }
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
  await destroyAllSessions(userId, keepTokenHash);
  await audit({ organizationId: user.organizationId, userId, action: "auth.password_change", entityType: "user", entityId: userId });
}
