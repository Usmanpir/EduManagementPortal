import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/server/auth/crypto";
import { env } from "@/server/env";
import { tick } from "@/server/jobs/runner";

/**
 * Scheduler endpoint for hosts with HTTP cron (e.g. every 5 minutes):
 *   Authorization: Bearer $CRON_SECRET
 * Self-hosted deployments can run `npm run jobs:worker` instead.
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!env.CRON_SECRET || !safeEqual(token, env.CRON_SECRET)) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, { status: 401 });
  }
  const result = await tick();
  return NextResponse.json({ success: true, data: result, message: "Tick complete" });
}
