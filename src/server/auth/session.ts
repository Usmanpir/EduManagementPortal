import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { db } from "@/server/db/client";
import { isProduction } from "@/server/env";
import { hashToken, randomToken } from "./crypto";

export const SESSION_COOKIE = isProduction ? "__Host-ea_session" : "ea_session";

const SHORT_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours
const LONG_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export async function requestMeta() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwarded || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
  };
}

/** Creates a session and sets the cookie. Only callable from route handlers / server actions. */
export async function createSession(userId: string, opts: { remember: boolean; campusId?: string | null }) {
  const token = randomToken();
  const ttl = opts.remember ? LONG_SESSION_MS : SHORT_SESSION_MS;
  const expiresAt = new Date(Date.now() + ttl);
  const meta = await requestMeta();

  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      campusId: opts.campusId ?? null,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    // Session-only cookie unless "remember me" was ticked.
    ...(opts.remember ? { expires: expiresAt } : {}),
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string, exceptTokenHash?: string) {
  await db.session.deleteMany({
    where: { userId, ...(exceptTokenHash ? { NOT: { tokenHash: exceptTokenHash } } : {}) },
  });
}

/**
 * Resolves the current session (once per request). Expired sessions and
 * disabled users are treated as signed out.
 */
export const getSession = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 200) return null;

  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (session.user.status === "DISABLED" || session.user.deletedAt) return null;

  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } })
      .catch(() => undefined);
  }

  return { ...session, tokenHash };
});

export type CurrentSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;
