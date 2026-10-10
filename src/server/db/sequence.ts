import "server-only";
import { db } from "./client";

/**
 * Atomically returns the next value of a per-organization counter
 * (admission numbers, employee IDs, invoice and receipt numbers).
 */
export async function nextSequence(organizationId: string, key: string, by = 1): Promise<number> {
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "sequences" ("organizationId", "key", "value")
    VALUES (${organizationId}::uuid, ${key}, ${by})
    ON CONFLICT ("organizationId", "key") DO UPDATE SET "value" = "sequences"."value" + ${by}
    RETURNING "value"`;
  return Number(rows[0]!.value);
}

/** Moves a counter forward so it is at least `value` (after imports with explicit numbers). */
export async function bumpSequenceTo(organizationId: string, key: string, value: number) {
  await db.$executeRaw`
    INSERT INTO "sequences" ("organizationId", "key", "value")
    VALUES (${organizationId}::uuid, ${key}, ${value})
    ON CONFLICT ("organizationId", "key") DO UPDATE SET "value" = GREATEST("sequences"."value", ${value})`;
}

export function formatCode(prefix: string, n: number, width = 4) {
  return `${prefix}-${String(n).padStart(width, "0")}`;
}
