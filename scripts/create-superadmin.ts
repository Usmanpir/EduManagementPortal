/**
 * Creates (or resets the password of) an EduAttend platform administrator.
 * Use this in production instead of the demo seed, which has a known password.
 *
 *   SUPERADMIN_EMAIL=you@company.com SUPERADMIN_PASSWORD='a long passphrase' \
 *     npm run platform:create-admin
 *
 * In Docker:  docker compose -f docker-compose.prod.yml run --rm \
 *               -e SUPERADMIN_EMAIL=... -e SUPERADMIN_PASSWORD=... worker npm run platform:create-admin
 */
import "dotenv/config";
import { db } from "@/server/db/client";
import { hashPassword } from "@/server/auth/crypto";
import { email as emailSchema, password as passwordSchema } from "@/lib/validation/common";

async function main() {
  const email = emailSchema.safeParse(process.env.SUPERADMIN_EMAIL ?? "");
  const password = passwordSchema.safeParse(process.env.SUPERADMIN_PASSWORD ?? "");
  if (!email.success) throw new Error("Set SUPERADMIN_EMAIL to a valid email address.");
  if (!password.success) throw new Error(`SUPERADMIN_PASSWORD: ${password.error.issues[0]?.message}`);

  const existing = await db.user.findUnique({ where: { email: email.data } });
  if (existing && !existing.isSuperAdmin) throw new Error("That email belongs to a school user. Use a separate address for platform administration.");
  const passwordHash = await hashPassword(password.data);
  if (existing) {
    await db.$transaction([db.user.update({ where: { id: existing.id }, data: { passwordHash, status: "ACTIVE" } }), db.session.deleteMany({ where: { userId: existing.id } })]);
    console.log(`Password reset for platform administrator ${email.data}; existing sessions signed out.`);
  } else {
    await db.user.create({ data: { email: email.data, passwordHash, firstName: "Platform", lastName: "Admin", isSuperAdmin: true, emailVerifiedAt: new Date() } });
    console.log(`Platform administrator ${email.data} created. Sign in at /login, then open /admin.`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
