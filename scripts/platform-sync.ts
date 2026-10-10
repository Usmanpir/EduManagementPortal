/**
 * Run after `prisma migrate deploy` on every deploy (idempotent):
 * adds new permissions (granting them to built-in roles) and the default
 * plan catalog on a fresh database.
 *
 *   npm run platform:sync
 */
import "dotenv/config";
import { db } from "@/server/db/client";
import { ensurePlans, syncSystemRoles } from "@/server/modules/organizations/provision";

async function main() {
  await ensurePlans();
  const r = await syncSystemRoles();
  console.log(r.introduced.length ? `New permissions: ${r.introduced.join(", ")} (granted ${r.granted} times to built-in roles).` : "Permissions up to date.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
