import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env, isProduction } from "@/server/env";

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: isProduction ? ["error"] : ["error", "warn"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

/**
 * Unscoped client. Only use for platform-level work (auth, super admin, jobs).
 * Tenant data must go through `tenantDb()` so organization scoping is automatic.
 */
export const db = globalForPrisma.prisma ?? createClient();

if (!isProduction) globalForPrisma.prisma = db;

export type Db = typeof db;
