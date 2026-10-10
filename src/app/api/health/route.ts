import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

const started = Date.now();

/**
 * Liveness + readiness for load balancers and uptime monitors.
 * 200 when the database answers; 503 otherwise. Never includes error details.
 */
export async function GET() {
  const t0 = Date.now();
  let database = "ok";
  try {
    await Promise.race([db.$queryRaw`SELECT 1`, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))]);
  } catch (error) {
    database = "unavailable";
    logger.error("health_db_failed", { error });
  }
  const healthy = database === "ok";
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks: { database }, latencyMs: Date.now() - t0, uptimeSeconds: Math.round((Date.now() - started) / 1000), version: process.env.APP_VERSION ?? "dev" },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
