"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarCheck2, FileText, GraduationCap, LayoutDashboard, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { useI18n } from "@/components/providers/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import type { PermissionKey } from "@/lib/permissions";
import { useShell } from "./shell-context";
import { LinkPending } from "@/components/common/link-pending";

type Tab = { href: string; label: TranslationKey; icon: LucideIcon; perm?: PermissionKey };

const STAFF_TABS: Tab[] = [
  { href: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
  { href: "/attendance", label: "nav.attendance", icon: CalendarCheck2, perm: "attendance.mark" },
  { href: "/students", label: "nav.students", icon: GraduationCap, perm: "students.view" },
  { href: "/finance", label: "nav.finance", icon: Wallet, perm: "payments.view" },
  { href: "/notifications", label: "nav.notifications", icon: Bell },
];

const PORTAL_TABS: Tab[] = [
  { href: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
  { href: "/my/attendance", label: "nav.attendance", icon: CalendarCheck2 },
  { href: "/my/results", label: "nav.results", icon: FileText },
  { href: "/my/fees", label: "nav.myFees", icon: Wallet },
  { href: "/notifications", label: "nav.notifications", icon: Bell },
];

/** Thumb-reachable primary navigation on phones. */
export function BottomNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { portal, can, unreadNotifications } = useShell();
  const tabs = (portal ? PORTAL_TABS : STAFF_TABS).filter((tab) => !tab.perm || can(tab.perm)).slice(0, 5);

  return (
    <nav
      aria-label="Primary"
      className="no-print fixed inset-x-0 bottom-0 z-(--z-header) border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      data-bottom-nav
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => {
          const active = pathname === tab.href || (tab.href !== "/dashboard" && pathname.startsWith(`${tab.href}/`));
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium outline-none focus-visible:bg-muted",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <tab.icon className="size-5" aria-hidden />
                <span className="max-w-full truncate px-1">{t(tab.label)}</span>
                <LinkPending />
                {tab.href === "/notifications" && unreadNotifications > 0 && (
                  <span className="absolute top-2 inset-s-1/2 ms-2 size-2 rounded-full bg-danger ring-2 ring-background" aria-label="Unread notifications" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
