/**
 * Permission catalog. Keys are stable identifiers stored in the database;
 * the server is the only authority that enforces them — the client uses the
 * same keys purely to hide UI the user cannot use.
 */
export const PERMISSIONS = {
  // Organization & access
  "dashboard.view": { module: "Dashboard", label: "View dashboard" },
  "organization.manage": { module: "Organization", label: "Manage organization profile & branding" },
  "campuses.view": { module: "Organization", label: "View campuses" },
  "campuses.manage": { module: "Organization", label: "Create & edit campuses" },
  "users.view": { module: "Users & roles", label: "View users" },
  "users.manage": { module: "Users & roles", label: "Invite, edit & disable users" },
  "roles.view": { module: "Users & roles", label: "View roles" },
  "roles.manage": { module: "Users & roles", label: "Create & edit roles" },
  "settings.manage": { module: "Organization", label: "Manage settings" },
  "audit.view": { module: "Organization", label: "View audit log" },

  // Data scope
  "records.all": {
    module: "Data access",
    label: "Access all classes",
    description: "Without this, users only see classes and students they are assigned to.",
  },

  // Academics
  "academics.view": { module: "Academics", label: "View classes, sections & subjects" },
  "academics.manage": { module: "Academics", label: "Manage academic structure" },
  "timetable.view": { module: "Academics", label: "View timetable" },
  "timetable.manage": { module: "Academics", label: "Edit timetable" },

  // People
  "students.view": { module: "Students", label: "View students" },
  "students.create": { module: "Students", label: "Add students" },
  "students.update": { module: "Students", label: "Edit students" },
  "students.archive": { module: "Students", label: "Archive students" },
  "students.import": { module: "Students", label: "Import students" },
  "students.export": { module: "Students", label: "Export students" },
  "teachers.view": { module: "Teachers & staff", label: "View teachers" },
  "teachers.manage": { module: "Teachers & staff", label: "Manage teachers" },
  "staff.view": { module: "Teachers & staff", label: "View staff" },
  "staff.manage": { module: "Teachers & staff", label: "Manage staff" },

  // Attendance
  "attendance.view": { module: "Attendance", label: "View student attendance" },
  "attendance.mark": { module: "Attendance", label: "Mark student attendance" },
  "attendance.edit": { module: "Attendance", label: "Edit submitted attendance & approve corrections" },
  "staff_attendance.view": { module: "Attendance", label: "View staff attendance" },
  "staff_attendance.mark": { module: "Attendance", label: "Mark staff attendance" },
  "leave.view": { module: "Leave", label: "View leave requests" },
  "leave.request": { module: "Leave", label: "Submit leave requests" },
  "leave.review": { module: "Leave", label: "Approve or reject leave" },

  // Finance
  "fees.view": { module: "Finance", label: "View fee structures" },
  "fees.manage": { module: "Finance", label: "Manage fee structures & assignments" },
  "invoices.view": { module: "Finance", label: "View invoices" },
  "invoices.manage": { module: "Finance", label: "Create & cancel invoices" },
  "payments.view": { module: "Finance", label: "View payments" },
  "payments.record": { module: "Finance", label: "Record payments" },
  "payments.void": { module: "Finance", label: "Void payments" },

  // Exams
  "exams.view": { module: "Exams", label: "View exams" },
  "exams.manage": { module: "Exams", label: "Create & schedule exams" },
  "marks.enter": { module: "Exams", label: "Enter marks" },
  "results.view": { module: "Exams", label: "View results" },
  "results.publish": { module: "Exams", label: "Compute & publish results" },

  // Communication & documents
  "announcements.view": { module: "Communication", label: "View announcements" },
  "announcements.manage": { module: "Communication", label: "Create & publish announcements" },
  "documents.view": { module: "Documents", label: "View documents" },
  "documents.manage": { module: "Documents", label: "Upload & archive documents" },

  // Reports & billing
  "reports.view": { module: "Reports", label: "View reports & analytics" },
  "reports.export": { module: "Reports", label: "Export reports" },
  "billing.view": { module: "Billing", label: "View subscription" },
  "billing.manage": { module: "Billing", label: "Change subscription" },
  "support.use": { module: "Help", label: "Open support tickets" },
} as const satisfies Record<string, { module: string; label: string; description?: string }>;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export type SystemRoleKey = "admin" | "principal" | "teacher" | "accountant" | "staff" | "parent" | "student";

const TEACHER: PermissionKey[] = [
  "dashboard.view",
  "academics.view",
  "timetable.view",
  "students.view",
  "attendance.view",
  "attendance.mark",
  "leave.view",
  "leave.request",
  "exams.view",
  "marks.enter",
  "results.view",
  "announcements.view",
  "documents.view",
  "support.use",
];

export const SYSTEM_ROLES: Record<
  SystemRoleKey,
  { name: string; description: string; permissions: PermissionKey[] }
> = {
  admin: {
    name: "Administrator",
    description: "Full access to everything in the organization, including billing and roles.",
    permissions: ALL_PERMISSIONS,
  },
  principal: {
    name: "Principal",
    description: "Runs academics, attendance, staff and reporting. No billing or role changes.",
    permissions: ALL_PERMISSIONS.filter((p) => !["billing.manage", "roles.manage", "payments.void"].includes(p)),
  },
  teacher: {
    name: "Teacher",
    description: "Marks attendance and enters marks for assigned classes.",
    permissions: TEACHER,
  },
  accountant: {
    name: "Accountant",
    description: "Manages fees, invoices and payments.",
    permissions: [
      "dashboard.view",
      "records.all",
      "academics.view",
      "students.view",
      "students.export",
      "fees.view",
      "fees.manage",
      "invoices.view",
      "invoices.manage",
      "payments.view",
      "payments.record",
      "reports.view",
      "reports.export",
      "announcements.view",
      "documents.view",
      "leave.request",
      "support.use",
    ],
  },
  staff: {
    name: "Staff",
    description: "Non-teaching employee with access to announcements and leave.",
    permissions: ["dashboard.view", "announcements.view", "leave.request", "support.use"],
  },
  parent: {
    name: "Parent",
    description: "Sees only their own children's attendance, fees and results.",
    permissions: ["dashboard.view", "announcements.view", "leave.request"],
  },
  student: {
    name: "Student",
    description: "Sees their own timetable, attendance and results.",
    permissions: ["dashboard.view", "announcements.view"],
  },
};

/** Roles whose users are portal users (parents/students) rather than staff. */
export const PORTAL_ROLES: SystemRoleKey[] = ["parent", "student"];

export function groupPermissionsByModule() {
  const groups = new Map<string, { key: PermissionKey; label: string; description?: string }[]>();
  for (const key of ALL_PERMISSIONS) {
    const p = PERMISSIONS[key] as { module: string; label: string; description?: string };
    const list = groups.get(p.module) ?? [];
    list.push({ key, label: p.label, description: p.description });
    groups.set(p.module, list);
  }
  return [...groups.entries()].map(([module, permissions]) => ({ module, permissions }));
}
