import { db } from "@/server/db/client";
import { hashPassword } from "@/server/auth/crypto";
import { createSystemRoles } from "@/server/modules/organizations/provision";
import { defaultSettingsForCountry } from "@/server/modules/organizations/settings";
import type { SystemRoleKey } from "@/lib/permissions";

export const DEMO_SLUG = "eduattend-demo";
export const DEMO_PASSWORD = "EduAttend#2026";

/** One login per role so every experience can be explored. */
export const DEMO_USERS: { key: string; role: SystemRoleKey; firstName: string; lastName: string; campus?: "isb" | "rwp" }[] = [
  { key: "admin", role: "admin", firstName: "Ahmed", lastName: "Khan" },
  { key: "principal", role: "principal", firstName: "Nadia", lastName: "Hussain" },
  { key: "teacher", role: "teacher", firstName: "Sara", lastName: "Malik", campus: "isb" },
  { key: "accountant", role: "accountant", firstName: "Bilal", lastName: "Qureshi" },
  { key: "parent", role: "parent", firstName: "Tariq", lastName: "Ali" },
  { key: "student", role: "student", firstName: "Muhammad", lastName: "Ali" },
];

export const demoEmail = (key: string) => `${key}@demo.eduattend.local`;

export type DemoContext = {
  orgId: string;
  campuses: { isb: string; rwp: string };
  roles: Record<SystemRoleKey, string>;
  users: Record<string, string>;
};

async function ensureOrganization(): Promise<DemoContext> {
  const existing = await db.organization.findUnique({ where: { slug: DEMO_SLUG }, include: { campuses: true, roles: true } });
  if (existing) {
    const users = await db.user.findMany({ where: { organizationId: existing.id }, select: { id: true, email: true } });
    return {
      orgId: existing.id,
      campuses: {
        isb: existing.campuses.find((c) => c.code === "ISB")!.id,
        rwp: existing.campuses.find((c) => c.code === "RWP")!.id,
      },
      roles: Object.fromEntries(existing.roles.map((r) => [r.key, r.id])) as Record<SystemRoleKey, string>,
      users: Object.fromEntries(users.map((u) => [u.email.split("@")[0]!, u.id])),
    };
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  // The demo school (two campuses, ~1,000 students) runs on the Business plan.
  const plan = await db.plan.findUniqueOrThrow({ where: { key: "business" } });

  return db.$transaction(
    async (tx) => {
      const settings = defaultSettingsForCountry("PK");
      settings.onboarding = { completedSteps: ["institution", "campus", "academic-year", "classes", "staff", "students", "attendance"], dismissed: false };
      const org = await tx.organization.create({
        data: {
          name: "EduAttend Demo School",
          legalName: "EduAttend Demo School (Pvt) Ltd",
          slug: DEMO_SLUG,
          email: "office@demo.eduattend.local",
          phone: "+92 51 1234567",
          address: "Street 12, F-8/3, Islamabad",
          country: "PK",
          timezone: "Asia/Karachi",
          currency: "PKR",
          settings,
          onboardingCompletedAt: new Date(),
        },
      });
      const isb = await tx.campus.create({
        data: { organizationId: org.id, name: "Islamabad Campus", code: "ISB", city: "Islamabad", address: "Street 12, F-8/3", phone: "+92 51 1234567", isMain: true },
      });
      const rwp = await tx.campus.create({
        data: { organizationId: org.id, name: "Rawalpindi Campus", code: "RWP", city: "Rawalpindi", address: "Peshawar Road, Rawalpindi Cantt", phone: "+92 51 7654321" },
      });
      const roles = await createSystemRoles(tx, org.id);

      const users: Record<string, string> = {};
      for (const u of DEMO_USERS) {
        const user = await tx.user.create({
          data: { organizationId: org.id, email: demoEmail(u.key), passwordHash, firstName: u.firstName, lastName: u.lastName, emailVerifiedAt: new Date() },
        });
        await tx.userRole.create({
          data: {
            organizationId: org.id,
            userId: user.id,
            roleId: roles[u.role],
            campusId: u.campus === "isb" ? isb.id : u.campus === "rwp" ? rwp.id : null,
          },
        });
        users[u.key] = user.id;
      }

      const now = new Date();
      await tx.subscription.create({
        data: {
          organizationId: org.id,
          planId: plan.id,
          status: "ACTIVE",
          billingCycle: "YEARLY",
          currentPeriodStart: new Date(now.getFullYear(), now.getMonth(), 1),
          currentPeriodEnd: new Date(now.getFullYear() + 1, now.getMonth(), 1),
        },
      });

      return { orgId: org.id, campuses: { isb: isb.id, rwp: rwp.id }, roles, users };
    },
    { timeout: 60_000 },
  );
}

export async function seedDemoOrganization() {
  const ctx = await ensureOrganization();
  console.log("• Demo organization: EduAttend Demo School (Islamabad & Rawalpindi campuses)");
  for (const u of DEMO_USERS) console.log(`    ${u.role.padEnd(10)} ${demoEmail(u.key)}  /  ${DEMO_PASSWORD}`);
  return ctx;
}
