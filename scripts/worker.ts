/**
 * Background worker: sends queued notifications and runs daily scheduled
 * tasks (attendance alerts, fee reminders, summaries, subscription checks).
 *
 *   npm run jobs:worker      # loop forever (every 60s)
 *   npm run jobs:run-once    # single tick, e.g. from a system cron
 */
import "dotenv/config";
import { tick } from "@/server/jobs/runner";
import { db } from "@/server/db/client";

const once = process.argv.includes("--once");
let stopping = false;

async function main() {
  do {
    try {
      const result = await tick();
      console.log(new Date().toISOString(), result);
    } catch (error) {
      console.error("tick failed", error);
    }
    if (once || stopping) break;
    await new Promise((r) => setTimeout(r, 60_000));
  } while (!stopping);
  await db.$disconnect();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

void main();
