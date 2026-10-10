import "server-only";
import { db } from "@/server/db/client";
import { ALL_PERMISSIONS, PERMISSIONS, SYSTEM_ROLES, type SystemRoleKey } from "@/lib/permissions";
import { DEFAULT_PLANS, TRIAL_PLAN_KEY } from "@/server/modules/billing/catalog";
import { defaultSettingsForCountry } from "./settings";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/** Makes the permissions table match the code catalog. Idempotent. */
export async function syncPermissions(tx: Tx | typeof db = db) {
  const existing = await tx.permission.findMany({ select: { key: true } });
  const have = new Set(existing.map((p) => p.key));
  const missing = ALL_PERMISSIONS.filter((k) => !have.has(k));
  if (missing.length) {
    await tx.permission.createMany({
      data: missing.map((key) => {
        const [module, action] = key.split(".");
        return { key, module: module!, action: action!, description: PERMISSIONS[key].label };
      }),
      skipDuplicates: true,
    });
  }
  return tx.permission.findMany({ select: { id: true, key: true } });
}

/**
 * After an upgrade that introduces new permissions, grants each one to every
 * school's built-in roles whose definition includes it. Only permissions that
 * are new in this deploy are granted, so anything an administrator removed
 * from a built-in role stays removed. Safe to run on every deploy.
 */
export async function syncSystemRoles() {
  const before = new Set((await db.permission.findMany({ select: { key: true } })).map((p) => p.key));
  const permissions = await syncPermissions();
  const introduced = permissions.filter((p) => !before.has(p.key));
  if (!introduced.length) return { introduced: [] as string[], granted: 0 };
  const roles = await db.role.findMany({ where: { isSystem: true }, select: { id: true, key: true } });
  // One batched insert per few thousand rows — a per-role loop takes minutes with thousands of schools.
  const rows: { roleId: string; permissionId: string }[] = [];
  for (const role of roles) {
    const def = SYSTEM_ROLES[role.key as keyof typeof SYSTEM_ROLES];
    if (!def) continue;
    for (const p of introduced) if ((def.permissions as string[]).includes(p.key)) rows.push({ roleId: role.id, permissionId: p.id });
  }
  let granted = 0;
  for (let i = 0; i < rows.length; i += 5000) {
    granted += (await db.rolePermission.createMany({ data: rows.slice(i, i + 5000), skipDuplicates: true })).count;
  }
  return { introduced: introduced.map((p) => p.key), granted };
}

/** Inserts the default catalog only when no plans exist yet. */
export async function ensurePlans(tx: Tx | typeof db = db) {
  const count = await tx.plan.count();
  if (count > 0) return;
  await tx.plan.createMany({
    data: DEFAULT_PLANS.map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description,
      priceMonthly: p.priceMonthly,
      priceYearly: p.priceYearly,
      limits: p.limits,
      features: p.features,
      highlighted: p.highlighted ?? false,
      isCustom: p.isCustom ?? false,
      sortOrder: p.sortOrder,
    })),
    skipDuplicates: true,
  });
}

/** Creates the built-in roles for an organization. */
export async function createSystemRoles(tx: Tx, organizationId: string) {
  const permissions = await syncPermissions(tx);
  const idByKey = new Map(permissions.map((p) => [p.key, p.id]));
  const roles = {} as Record<SystemRoleKey, string>;

  for (const [key, def] of Object.entries(SYSTEM_ROLES) as [SystemRoleKey, (typeof SYSTEM_ROLES)[SystemRoleKey]][]) {
    const role = await tx.role.create({
      data: { organizationId, key, name: def.name, description: def.description, isSystem: true },
    });
    await tx.rolePermission.createMany({
      data: def.permissions.map((p) => ({ roleId: role.id, permissionId: idByKey.get(p)! })),
    });
    roles[key] = role.id;
  }
  return roles;
}

export function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "school"
  );
}

async function uniqueSlug(tx: Tx, name: string) {
  const base = slugify(name);
  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const taken = await tx.organization.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export type ProvisionInput = {
  organizationName: string;
  country: string;
  timezone?: string;
  currency?: string;
  admin: { firstName: string; lastName: string; email: string; passwordHash: string; phone?: string };
};

const COUNTRY_DEFAULTS: Record<string, { timezone: string; currency: string }> = {
  PK: { timezone: "Asia/Karachi", currency: "PKR" },
  AE: { timezone: "Asia/Dubai", currency: "AED" },
  SA: { timezone: "Asia/Riyadh", currency: "SAR" },
  GB: { timezone: "Europe/London", currency: "GBP" },
  US: { timezone: "America/New_York", currency: "USD" },
  IN: { timezone: "Asia/Kolkata", currency: "INR" },
  BD: { timezone: "Asia/Dhaka", currency: "BDT" },
};

/**
 * Creates a fully working tenant in a single transaction: organization, main
 * campus, system roles, the admin user and a trial subscription.
 */
export async function provisionOrganization(input: ProvisionInput) {
  await ensurePlans();
  const defaults = COUNTRY_DEFAULTS[input.country] ?? { timezone: "UTC", currency: "USD" };

  return db.$transaction(async (tx) => {
    const slug = await uniqueSlug(tx, input.organizationName);
    const org = await tx.organization.create({
      data: {
        name: input.organizationName,
        slug,
        country: input.country,
        timezone: input.timezone ?? defaults.timezone,
        currency: input.currency ?? defaults.currency,
        settings: defaultSettingsForCountry(input.country),
      },
    });

    const campus = await tx.campus.create({
      data: { organizationId: org.id, name: "Main Campus", code: "MAIN", isMain: true },
    });

    const roles = await createSystemRoles(tx, org.id);

    const user = await tx.user.create({
      data: {
        organizationId: org.id,
        email: input.admin.email,
        passwordHash: input.admin.passwordHash,
        firstName: input.admin.firstName,
        lastName: input.admin.lastName,
        phone: input.admin.phone,
      },
    });
    await tx.userRole.create({ data: { organizationId: org.id, userId: user.id, roleId: roles.admin } });

    const plan =
      (await tx.plan.findUnique({ where: { key: TRIAL_PLAN_KEY } })) ??
      (await tx.plan.findFirst({ where: { isPublic: true, isCustom: false }, orderBy: { sortOrder: "asc" } }));
    if (plan) {
      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000);
      await tx.subscription.create({
        data: {
          organizationId: org.id,
          planId: plan.id,
          status: "TRIALING",
          trialEndsAt,
          currentPeriodStart: now,
          currentPeriodEnd: trialEndsAt,
        },
      });
    }

    return { organization: org, campus, user, roles };
  });
}
