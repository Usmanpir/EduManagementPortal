import "dotenv/config";
import { vi } from "vitest";

// Point every server module at the disposable test database.
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL must be set for integration tests");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.AUTH_SECRET ??= "integration-test-secret-integration-test-secret";
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString("base64");
process.env.EMAIL_PROVIDER = "console";
process.env.APP_URL = "http://localhost:3000";

/**
 * Minimal stand-in for next/headers so route handlers and services that read
 * cookies/headers can run outside a Next.js request.
 */
const cookieJar = new Map<string, string>();
const headerJar = new Map<string, string>();
/** Options the app set on each cookie (httpOnly, sameSite…), for security assertions. */
const cookieOptions = new Map<string, Record<string, unknown>>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    has: (name: string) => cookieJar.has(name),
    set: (name: string, value: string, opts?: Record<string, unknown>) => {
      cookieJar.set(name, value);
      cookieOptions.set(name, opts ?? {});
    },
    delete: (name: string) => void cookieJar.delete(name),
    getAll: () => [...cookieJar.entries()].map(([name, value]) => ({ name, value })),
  }),
  headers: async () => new Headers([...headerJar.entries()]),
}));

// Silence expected console output from the console email provider.
vi.spyOn(console, "info").mockImplementation(() => undefined);

export const testCookies = cookieJar;
export const testCookieOptions = cookieOptions;
export const testHeaders = headerJar;
