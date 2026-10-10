"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useI18n } from "@/components/providers/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import { useShell } from "./shell-context";

const SEGMENT_KEYS: Record<string, TranslationKey> = {
  dashboard: "nav.dashboard",
  students: "nav.students",
  teachers: "nav.teachers",
  staff: "nav.staff",
  academics: "nav.academics",
  classes: "nav.classes",
  sections: "nav.sections",
  subjects: "nav.subjects",
  timetable: "nav.timetable",
  attendance: "nav.attendance",
  leave: "nav.leave",
  finance: "nav.finance",
  fees: "nav.fees",
  invoices: "nav.invoices",
  payments: "nav.payments",
  exams: "nav.exams",
  marks: "nav.marks",
  results: "nav.results",
  communication: "nav.communication",
  announcements: "nav.announcements",
  notifications: "nav.notifications",
  documents: "nav.documents",
  reports: "nav.reports",
  settings: "nav.settings",
  help: "nav.help",
  billing: "nav.subscription",
};

const SEGMENT_LABELS: Record<string, string> = {
  mark: "Mark attendance",
  new: "New",
  import: "Import",
  edit: "Edit",
  profile: "Profile",
  onboarding: "Setup",
  my: "My",
  rooms: "Rooms",
  years: "Academic years",
  departments: "Departments",
  general: "General",
  branding: "Branding",
  roles: "Roles",
  users: "Users",
  campuses: "Campuses",
  security: "Security",
  integrations: "Integrations",
  academic: "Academic",
  tickets: "Support tickets",
  support: "Support",
  analytics: "Analytics",
  timetable: "Timetable",
  leave: "Leave",
  audit: "Audit log",
  "report-card": "Report card",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useBreadcrumbs() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { crumbLabels } = useShell();
  const segments = pathname.split("/").filter(Boolean);

  return segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const key = SEGMENT_KEYS[segment];
    const label =
      crumbLabels[segment] ??
      (key ? t(key) : SEGMENT_LABELS[segment]) ??
      (UUID.test(segment) ? "Details" : decodeURIComponent(segment).replace(/-/g, " "));
    return { href, label, segment };
  });
}

export function Breadcrumbs() {
  const crumbs = useBreadcrumbs();
  if (crumbs.length === 0) return null;
  // "My" is a grouping segment without its own page.
  const visible = crumbs.filter((c) => c.segment !== "my");

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {visible.map((crumb, i) => {
          const last = i === visible.length - 1;
          return (
            <Fragment key={crumb.href}>
              {i > 0 && <BreadcrumbSeparator className="hidden md:inline-flex rtl:rotate-180" />}
              <BreadcrumbItem className={last ? "min-w-0" : "hidden md:inline-flex"}>
                {last ? (
                  <BreadcrumbPage className="truncate font-medium">{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href} className="whitespace-nowrap">
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
