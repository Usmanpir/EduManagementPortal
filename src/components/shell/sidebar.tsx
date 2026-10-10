"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, CreditCard, LifeBuoy, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/components/providers/i18n-provider";
import { Logo, LogoMark } from "@/components/brand/logo";
import { filterNav, isActivePath, PORTAL_NAV, STAFF_NAV, type NavItem, type NavLink } from "./nav-config";
import { WorkspaceSwitcher } from "./campus-switcher";
import { UserMenu } from "./user-menu";
import { useShell } from "./shell-context";
import { SIDEBAR_COOKIE } from "./sidebar-cookie";
import { LinkPending } from "@/components/common/link-pending";


/** Picks the most specific matching link so "/attendance" doesn't light up on "/attendance/staff". */
function bestMatch(pathname: string, links: NavLink[]): string | null {
  let best: { key: string; length: number } | null = null;
  for (const link of links) {
    for (const prefix of [link.href, ...(link.match ?? [])]) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        // `>=`: children are listed after their group, so a child sharing the group's href wins.
        if (!best || prefix.length >= best.length) best = { key: link.key, length: prefix.length };
      }
    }
  }
  return best?.key ?? null;
}

export function useNavItems() {
  const { permissions, portal } = useShell();
  return useMemo(() => filterNav(portal ? PORTAL_NAV : STAFF_NAV, new Set(permissions)), [permissions, portal]);
}

function itemIsActive(pathname: string, item: NavItem) {
  if (item.children?.length) return item.children.some((c) => isActivePath(pathname, c)) || isActivePath(pathname, item);
  return isActivePath(pathname, item);
}

export function NavTree({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const items = useNavItems();
  const topActive = bestMatch(pathname, items.flatMap((i) => [i, ...(i.children ?? [])]));

  // Groups follow the current page unless the user explicitly toggled them.
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = itemIsActive(pathname, item);
        const Icon = item.icon;
        const hasChildren = !!item.children?.length && item.children.length > 1;
        const isOpen = open[item.key] ?? active;
        // An open group shows its active child instead, so the header itself stays unhighlighted.
        const highlighted = active && !(hasChildren && isOpen && !collapsed);
        const baseClass = cn(
          "group/nav flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-small font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          highlighted
            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs ring-1 ring-sidebar-border"
            : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          collapsed && "justify-center px-0",
        );
        const icon = <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover/nav:text-foreground")} />;

        if (collapsed || !hasChildren) {
          const href = hasChildren || item.children?.length === 1 ? (item.children?.[0]?.href ?? item.href) : item.href;
          const link = (
            <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={baseClass}>
              {icon}
              {!collapsed && <span className="truncate">{t(item.label)}</span>}
              <LinkPending />
            </Link>
          );
          return (
            <li key={item.key}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{t(item.label)}</TooltipContent>
                </Tooltip>
              ) : (
                link
              )}
            </li>
          );
        }

        return (
          <li key={item.key}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen((prev) => ({ ...prev, [item.key]: !isOpen }))}
              className={cn(baseClass, active && isOpen && "text-foreground")}
            >
              {icon}
              <span className="flex-1 truncate text-start">{t(item.label)}</span>
              <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform duration-200 rtl:rotate-180", isOpen && "rotate-90 rtl:rotate-90")} />
            </button>
            {isOpen && (
              <ul className="relative mt-0.5 mb-1 flex flex-col gap-0.5 ps-5.5 before:absolute before:inset-y-1 before:inset-s-3.75 before:w-px before:bg-sidebar-border">
                {item.children!.map((child) => {
                  const childActive = topActive === child.key;
                  return (
                    <li key={child.key}>
                      <Link
                        href={child.href}
                        onClick={onNavigate}
                        aria-current={childActive ? "page" : undefined}
                        className={cn(
                          "flex h-7.5 items-center rounded-md px-2 text-small transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                          childActive
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-xs ring-1 ring-sidebar-border"
                            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                        )}
                      >
                        {t(child.label)}
                        <LinkPending />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FooterLink({ href, icon: Icon, label, collapsed }: { href: string; icon: typeof LifeBuoy; label: string; collapsed: boolean }) {
  const pathname = usePathname();
  const active = pathname.startsWith(href);
  const link = (
    <Link
      href={href}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2 text-small font-medium outline-none hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active ? "bg-sidebar-accent text-foreground shadow-xs ring-1 ring-sidebar-border" : "text-sidebar-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="size-4 text-muted-foreground" />
      {!collapsed && label}
      <LinkPending />
    </Link>
  );
  return collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  ) : (
    link
  );
}

export function Sidebar() {
  const { t } = useI18n();
  const { sidebarCollapsed, can, subscription } = useShell();
  const [collapsed, setCollapsed] = useState(sidebarCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        "sticky top-0 z-(--z-sidebar) hidden h-dvh shrink-0 flex-col bg-sidebar transition-[width] duration-200 ease-standard lg:flex",
        collapsed ? "w-sidebar-collapsed" : "w-sidebar",
      )}
    >
      <div className={cn("flex h-header items-center gap-2 px-3", collapsed && "justify-center px-0")}>
        {collapsed ? <LogoMark className="size-6" /> : <Logo className="flex-1 ps-1" />}
        {!collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggle}
                aria-label={t("shell.toggleSidebar")}
                className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <PanelLeftClose className="size-4 rtl:rotate-180" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t("shell.toggleSidebar")}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className={cn("px-3 pb-2", collapsed && "px-2")}>
        <WorkspaceSwitcher collapsed={collapsed} />
      </div>

      <nav className={cn("no-scrollbar flex-1 overflow-y-auto px-3 py-2", collapsed && "px-2")}>
        <NavTree collapsed={collapsed} />
      </nav>

      <div className={cn("flex flex-col gap-0.5 border-t border-sidebar-border px-3 py-3", collapsed && "px-2")}>
        <FooterLink href="/help" icon={LifeBuoy} label={t("nav.help")} collapsed={collapsed} />
        {can("billing.view") && (
          <FooterLink
            href="/settings/billing"
            icon={CreditCard}
            label={subscription?.trialDaysLeft != null ? `${t("nav.subscription")} · ${subscription.trialDaysLeft}d trial` : t("nav.subscription")}
            collapsed={collapsed}
          />
        )}
        {collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggle}
                aria-label={t("shell.toggleSidebar")}
                className="flex h-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <PanelLeftOpen className="size-4 rtl:rotate-180" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t("shell.toggleSidebar")}</TooltipContent>
          </Tooltip>
        )}
        <div className="mt-1.5">
          <UserMenu collapsed={collapsed} />
        </div>
      </div>
    </aside>
  );
}
