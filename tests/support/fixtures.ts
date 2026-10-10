import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { hashPassword, hashToken, randomToken } from "@/server/auth/crypto";
import { provisionOrganization } from "@/server/modules/organizations/provision";
import type { SystemRoleKey } from "@/lib/permissions";
import { testCookies } from "./integration-env";

const SESSION_COOKIE = "ea_session";
let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

let cachedHash: string | null = null;
export async function testPasswordHash() {
  cachedHash ??= await hashPassword("Password123!");
  return cachedHash;
}

/** Creates an organization with its admin user. */
export async function createOrg(name = "Test School") {
  const id = unique();
  const result = await provisionOrganization({
    organizationName: `${name} ${id}`,
    country: "PK",
    admin: { firstName: "Admin", lastName: id, email: `admin-${id}@test.local`, passwordHash: await testPasswordHash() },
  });
  return { org: result.organization, campus: result.campus, admin: result.user, roles: result.roles };
}

/** Adds a user with a system role (optionally restricted to a campus). */
export async function createUser(
  org: { organizationId: string; roles: Record<SystemRoleKey, string> },
  role: SystemRoleKey,
  opts: { campusId?: string; firstName?: string } = {},
) {
  const id = unique();
  const user = await db.user.create({
    data: {
      organizationId: org.organizationId,
      email: `${role}-${id}@test.local`,
      passwordHash: await testPasswordHash(),
      firstName: opts.firstName ?? role,
      lastName: id,
    },
  });
  await db.userRole.create({
    data: { organizationId: org.organizationId, userId: user.id, roleId: org.roles[role], campusId: opts.campusId ?? null },
  });
  return user;
}

/** Signs in as a user for subsequent route-handler calls (sets the mocked session cookie). */
export async function signInAs(userId: string, campusId: string | null = null) {
  const token = randomToken();
  await db.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3_600_000), campusId },
  });
  testCookies.clear();
  testCookies.set(SESSION_COOKIE, token);
  return token;
}

export function signOut() {
  testCookies.clear();
}

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string | string[] | undefined>> }) => Promise<Response>;

/** Invokes a route handler the way Next.js would, with a same-origin browser-like request. */
export async function call<T = unknown>(
  handler: Handler,
  opts: { method?: string; path?: string; body?: unknown; params?: Record<string, string | string[]>; query?: Record<string, string> } = {},
) {
  const url = new URL(opts.path ?? "/api/test", "http://localhost:3000");
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  const headers = new Headers({ origin: "http://localhost:3000", "content-type": "application/json" });
  const token = testCookies.get(SESSION_COOKIE);
  if (token) headers.set("cookie", `${SESSION_COOKIE}=${token}`);
  const req = new NextRequest(url, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const json = (await res.json()) as { success: boolean; data: T; message?: string; error?: { code: string; message: string; fields?: Record<string, string> } };
  return { status: res.status, ...json };
}
