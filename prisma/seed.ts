/**
 * Seeds a local database with the platform defaults and a realistic demo school.
 * Idempotent: re-running never duplicates or deletes data.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { db } from "@/server/db/client";
import { seedPlatform } from "./seed/platform";
import { seedDemoOrganization } from "./seed/demo";
import { seedAcademics } from "./seed/academics";
import { seedPeople } from "./seed/people";
import { seedAttendance } from "./seed/attendance";
import { seedTimetable } from "./seed/timetable";
import { seedFinance } from "./seed/finance";
import { seedExams } from "./seed/exams";
import { seedCommunication } from "./seed/communication";
import { seedBilling } from "./seed/billing";

async function main() {
  const started = Date.now();
  await seedPlatform();
  const demo = await seedDemoOrganization();
  const academics = await seedAcademics(demo);
  await seedPeople(demo, academics);
  await seedAttendance(demo);
  await seedTimetable(demo);
  await seedFinance(demo);
  await seedExams(demo);
  await seedCommunication(demo);
  await seedBilling(demo);
  console.log(`\n✓ Seed finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
