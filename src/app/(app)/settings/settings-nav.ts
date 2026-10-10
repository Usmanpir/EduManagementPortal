import type { PermissionKey } from "@/lib/permissions";

export type SettingsSection = { href: string; label: string; description: string; anyOf: PermissionKey[]; group: string };

/** Settings sections, grouped; each is visible only with the listed permissions. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { group: "Organization", href: "/settings/general", label: "General", description: "Name, contact details, region", anyOf: ["organization.manage"] },
  { group: "Organization", href: "/settings/campuses", label: "Campuses", description: "Locations and branches", anyOf: ["campuses.view"] },
  { group: "Organization", href: "/settings/billing", label: "Billing", description: "Plan, usage and invoices", anyOf: ["billing.view"] },
  { group: "School", href: "/settings/academic", label: "Academic", description: "Academic years, departments, rooms", anyOf: ["academics.manage"] },
  { group: "School", href: "/settings/attendance", label: "Attendance", description: "Mode, alerts, staff check-in", anyOf: ["settings.manage"] },
  { group: "School", href: "/settings/exams", label: "Exams & grading", description: "Pass marks, grading scale, report cards", anyOf: ["settings.manage"] },
  { group: "School", href: "/settings/notifications", label: "Notifications", description: "Email, WhatsApp, SMS and delivery log", anyOf: ["settings.manage"] },
  { group: "Access", href: "/settings/users", label: "Users", description: "People who can sign in", anyOf: ["users.view"] },
  { group: "Access", href: "/settings/roles", label: "Roles & permissions", description: "What each role can do", anyOf: ["roles.view"] },
  { group: "Access", href: "/settings/audit", label: "Audit log", description: "Who changed what", anyOf: ["audit.view"] },
];

export function visibleSections(permissions: ReadonlySet<string>) {
  return SETTINGS_SECTIONS.filter((s) => s.anyOf.some((p) => permissions.has(p)));
}
