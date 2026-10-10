/**
 * Default plan catalog used only to seed an empty database. After that, plans
 * live in the `plans` table and are edited by super admins — nothing in the
 * product reads prices or limits from this file.
 */
export type PlanLimits = {
  students: number | null;
  teachers: number | null;
  staff: number | null;
  campuses: number | null;
  storageMb: number | null;
  notificationsPerMonth: number | null;
  apiRequestsPerDay: number | null;
};

export const DEFAULT_PLANS: {
  key: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  limits: PlanLimits;
  features: string[];
  highlighted?: boolean;
  isCustom?: boolean;
  sortOrder: number;
}[] = [
  {
    key: "starter",
    name: "Starter",
    description: "For small schools and academies getting organized.",
    priceMonthly: 4999,
    priceYearly: 49990,
    limits: { students: 200, teachers: 20, staff: 30, campuses: 1, storageMb: 2048, notificationsPerMonth: 2000, apiRequestsPerDay: 5000 },
    features: ["Every feature included", "Email support"],
    sortOrder: 1,
  },
  {
    key: "professional",
    name: "Professional",
    description: "For growing schools with more students and campuses.",
    priceMonthly: 12999,
    priceYearly: 129990,
    limits: { students: 1000, teachers: 80, staff: 120, campuses: 3, storageMb: 10240, notificationsPerMonth: 15000, apiRequestsPerDay: 25000 },
    features: ["Every feature included", "Priority email support"],
    highlighted: true,
    sortOrder: 2,
  },
  {
    key: "business",
    name: "Business",
    description: "For school groups running multiple campuses.",
    priceMonthly: 29999,
    priceYearly: 299990,
    limits: { students: 5000, teachers: 400, staff: 600, campuses: 10, storageMb: 51200, notificationsPerMonth: 75000, apiRequestsPerDay: 100000 },
    features: ["Every feature included", "Priority support", "Multi-campus reporting"],
    sortOrder: 3,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    description: "Universities and large networks with custom requirements.",
    priceMonthly: 0,
    priceYearly: 0,
    limits: { students: null, teachers: null, staff: null, campuses: null, storageMb: null, notificationsPerMonth: null, apiRequestsPerDay: null },
    features: ["Every feature included", "Custom limits & pricing", "Dedicated onboarding"],
    isCustom: true,
    sortOrder: 4,
  },
];

export const TRIAL_PLAN_KEY = "professional";
