import {
  CalendarCheck2,
  ChartColumn,
  FileText,
  FolderOpen,
  GraduationCap,
  IdCard,
  LayoutDashboard,
  Library,
  Megaphone,
  NotebookPen,
  Presentation,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";
import type { TranslationKey } from "@/lib/i18n";

export type NavLink = {
  key: string;
  label: TranslationKey;
  href: string;
  /** Visible when the user has any of these permissions. */
  anyOf?: PermissionKey[];
  /** Extra path prefixes that should mark this item active. */
  match?: string[];
};

export type NavItem = NavLink & {
  icon: LucideIcon;
  children?: NavLink[];
};

export const STAFF_NAV: NavItem[] = [
  { key: "dashboard", label: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard, anyOf: ["dashboard.view"] },
  { key: "students", label: "nav.students", href: "/students", icon: GraduationCap, anyOf: ["students.view"] },
  { key: "teachers", label: "nav.teachers", href: "/teachers", icon: Presentation, anyOf: ["teachers.view"] },
  { key: "staff", label: "nav.staff", href: "/staff", icon: IdCard, anyOf: ["staff.view"] },
  {
    key: "academics",
    label: "nav.academics",
    href: "/academics/classes",
    icon: Library,
    anyOf: ["academics.view", "timetable.view"],
    children: [
      { key: "classes", label: "nav.classes", href: "/academics/classes", anyOf: ["academics.view"] },
      { key: "sections", label: "nav.sections", href: "/academics/sections", anyOf: ["academics.view"] },
      { key: "subjects", label: "nav.subjects", href: "/academics/subjects", anyOf: ["academics.view"] },
      { key: "timetable", label: "nav.timetable", href: "/academics/timetable", anyOf: ["timetable.view"] },
    ],
  },
  {
    key: "attendance",
    label: "nav.attendance",
    href: "/attendance",
    icon: CalendarCheck2,
    anyOf: ["attendance.view", "attendance.mark", "staff_attendance.view", "leave.view", "leave.request"],
    children: [
      { key: "student-attendance", label: "nav.studentAttendance", href: "/attendance", anyOf: ["attendance.view", "attendance.mark"], match: ["/attendance/mark"] },
      { key: "staff-attendance", label: "nav.staffAttendance", href: "/attendance/staff", anyOf: ["staff_attendance.view"] },
      { key: "leave", label: "nav.leave", href: "/attendance/leave", anyOf: ["leave.view", "leave.request"] },
      { key: "attendance-reports", label: "nav.attendanceReports", href: "/attendance/reports", anyOf: ["attendance.view"] },
    ],
  },
  {
    key: "finance",
    label: "nav.finance",
    href: "/finance",
    icon: Wallet,
    anyOf: ["fees.view", "invoices.view", "payments.view"],
    children: [
      { key: "finance-overview", label: "nav.dashboard", href: "/finance", anyOf: ["invoices.view", "payments.view"] },
      { key: "fees", label: "nav.fees", href: "/finance/fees", anyOf: ["fees.view"] },
      { key: "invoices", label: "nav.invoices", href: "/finance/invoices", anyOf: ["invoices.view"] },
      { key: "payments", label: "nav.payments", href: "/finance/payments", anyOf: ["payments.view"] },
      { key: "finance-reports", label: "nav.financeReports", href: "/finance/reports", anyOf: ["reports.view"] },
    ],
  },
  {
    key: "exams",
    label: "nav.exams",
    href: "/exams",
    icon: NotebookPen,
    anyOf: ["exams.view", "marks.enter", "results.view"],
    children: [
      { key: "exam-list", label: "nav.examList", href: "/exams", anyOf: ["exams.view"] },
      { key: "marks", label: "nav.marks", href: "/exams/marks", anyOf: ["marks.enter"] },
      { key: "results", label: "nav.results", href: "/exams/results", anyOf: ["results.view"] },
    ],
  },
  {
    key: "communication",
    label: "nav.communication",
    href: "/communication/announcements",
    icon: Megaphone,
    anyOf: ["announcements.view"],
    children: [
      { key: "announcements", label: "nav.announcements", href: "/communication/announcements", anyOf: ["announcements.view"] },
      { key: "notifications", label: "nav.notifications", href: "/notifications" },
    ],
  },
  { key: "documents", label: "nav.documents", href: "/documents", icon: FolderOpen, anyOf: ["documents.view"] },
  { key: "reports", label: "nav.reports", href: "/reports", icon: ChartColumn, anyOf: ["reports.view"] },
  { key: "settings", label: "nav.settings", href: "/settings", icon: Settings, anyOf: ["settings.manage", "organization.manage", "users.view", "roles.view", "billing.view"] },
];

/** Parents and students get a deliberately short navigation. */
export const PORTAL_NAV: NavItem[] = [
  { key: "dashboard", label: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "my-attendance", label: "nav.myAttendance", href: "/my/attendance", icon: CalendarCheck2 },
  { key: "my-timetable", label: "nav.myTimetable", href: "/my/timetable", icon: Library },
  { key: "my-results", label: "nav.myResults", href: "/my/results", icon: FileText },
  { key: "my-fees", label: "nav.myFees", href: "/my/fees", icon: Wallet },
  { key: "announcements", label: "nav.announcements", href: "/communication/announcements", icon: Megaphone },
  { key: "my-leave", label: "nav.leave", href: "/my/leave", icon: Users },
];

export function filterNav(items: NavItem[], permissions: ReadonlySet<string>): NavItem[] {
  const allowed = (link: NavLink) => !link.anyOf || link.anyOf.some((p) => permissions.has(p));
  return items
    .filter(allowed)
    .map((item) => (item.children ? { ...item, children: item.children.filter(allowed) } : item))
    .filter((item) => !item.children || item.children.length > 0);
}

export function isActivePath(pathname: string, link: NavLink): boolean {
  const prefixes = [link.href, ...(link.match ?? [])];
  return prefixes.some((p) => pathname === p || (p !== "/dashboard" && pathname.startsWith(`${p}/`)));
}
