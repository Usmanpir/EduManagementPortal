import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppShell } from "@/components/shell/app-shell";
import { SIDEBAR_COOKIE } from "@/components/shell/sidebar-cookie";
import { isPortalUser, requirePageContext } from "@/server/auth/context";
import { subscriptionSummary } from "@/server/modules/billing/summary";
import { unreadCount } from "@/server/modules/communication/notifications";
import { fileUrl } from "@/server/storage/urls";

/** Signed-in pages are private and never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requirePageContext();
  const jar = await cookies();

  const [campuses, unread, subscription, roles] = await Promise.all([
    ctx.db.campus.findMany({
      where: { deletedAt: null, ...(ctx.allowedCampusIds ? { id: { in: ctx.allowedCampusIds } } : {}) },
      select: { id: true, name: true },
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
    }),
    unreadCount(ctx.user.id),
    subscriptionSummary(ctx.orgId),
    ctx.db.role.findMany({ where: { key: { in: ctx.roleKeys } }, select: { name: true } }),
  ]);

  const name = `${ctx.user.firstName} ${ctx.user.lastName}`.trim();

  return (
    <AppShell
      data={{
        user: {
          id: ctx.user.id,
          name,
          firstName: ctx.user.firstName,
          email: ctx.user.email,
          initials: `${ctx.user.firstName[0] ?? ""}${ctx.user.lastName[0] ?? ""}`.toUpperCase(),
          avatarUrl: fileUrl(ctx.user.avatarKey),
        },
        organization: { name: ctx.organization.name, logoUrl: fileUrl(ctx.organization.logoKey) },
        campuses,
        campusId: ctx.campusId,
        canViewAllCampuses: ctx.allowedCampusIds === null,
        permissions: [...ctx.permissions],
        roleNames: roles.map((r) => r.name),
        portal: isPortalUser(ctx),
        unreadNotifications: unread,
        subscription,
        setupIncomplete: !ctx.organization.onboardingCompletedAt && !ctx.settings.onboarding.dismissed,
        sidebarCollapsed: jar.get(SIDEBAR_COOKIE)?.value === "collapsed",
      }}
    >
      {children}
    </AppShell>
  );
}
