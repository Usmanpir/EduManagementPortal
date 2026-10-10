import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { logger } from "@/server/logger";

const STALE_LOCK_MS = 15 * 60_000;
const RETRY_DELAY_MS = 5 * 60_000;

/**
 * Runs `work` at most once successfully per dedupe key (e.g. one daily summary
 * per organization per day). Failures are retried on later ticks with backoff;
 * a crashed run is retried once its lock goes stale. Safe across many workers.
 */
export async function runOnce(type: string, dedupeKey: string, work: () => Promise<unknown>, maxAttempts = 5) {
  const worker = `${process.pid}`;
  let job = await db.job.findUnique({ where: { dedupeKey } });
  if (!job) {
    try {
      job = await db.job.create({ data: { type, dedupeKey, status: "RUNNING", attempts: 1, lockedAt: new Date(), lockedBy: worker } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "skipped";
      throw error;
    }
  } else {
    if (job.status === "COMPLETED") return "skipped";
    if (job.attempts >= job.maxAttempts) return "skipped";
    const lockAge = Date.now() - (job.lockedAt?.getTime() ?? 0);
    if (job.status === "RUNNING" && lockAge < STALE_LOCK_MS) return "skipped";
    if (job.status === "FAILED" && job.runAt > new Date()) return "skipped";
    // Atomically take over the job only if nobody else did in the meantime.
    const taken = await db.job.updateMany({
      where: { id: job.id, status: job.status, attempts: job.attempts },
      data: { status: "RUNNING", attempts: { increment: 1 }, lockedAt: new Date(), lockedBy: worker },
    });
    if (taken.count === 0) return "skipped";
    job = { ...job, attempts: job.attempts + 1 };
  }

  try {
    await work();
    await db.job.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date(), lastError: null } });
    return "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
    logger.error("job_failed", { type, dedupeKey, attempt: job.attempts, error });
    await db.job.update({
      where: { id: job.id },
      data: { status: "FAILED", lastError: message, runAt: new Date(Date.now() + RETRY_DELAY_MS * 2 ** (job.attempts - 1)), maxAttempts },
    });
    return "failed";
  }
}
