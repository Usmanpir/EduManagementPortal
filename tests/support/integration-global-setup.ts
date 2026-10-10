import { execSync } from "node:child_process";
import "dotenv/config";

/**
 * Applies pending migrations to the test database once before the suite.
 * Non-destructive: tests never wipe data — every test builds its own uniquely
 * named organization, which is also what keeps tests independent.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL must be set for integration tests");
  if (!/test/i.test(url)) throw new Error("Refusing to run integration tests: TEST_DATABASE_URL must point to a *test* database");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
