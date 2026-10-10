import { db } from "@/server/db/client";
import { hashPassword } from "@/server/auth/crypto";
import { ensurePlans, syncPermissions } from "@/server/modules/organizations/provision";

export const SUPER_ADMIN = { email: "superadmin@eduattend.local", password: "SuperAdmin#2026" };

export async function seedPlatform() {
  await syncPermissions();
  await ensurePlans();

  const existing = await db.user.findUnique({ where: { email: SUPER_ADMIN.email } });
  if (!existing) {
    await db.user.create({
      data: {
        email: SUPER_ADMIN.email,
        passwordHash: await hashPassword(SUPER_ADMIN.password),
        firstName: "Platform",
        lastName: "Admin",
        isSuperAdmin: true,
      },
    });
    console.log(`• Super admin created: ${SUPER_ADMIN.email} / ${SUPER_ADMIN.password}`);
  } else {
    console.log(`• Super admin exists: ${SUPER_ADMIN.email}`);
  }
}
