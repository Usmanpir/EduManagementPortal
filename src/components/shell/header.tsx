"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "@/components/brand/logo";
import { useI18n } from "@/components/providers/i18n-provider";
import { Breadcrumbs } from "./breadcrumbs";
import { WorkspaceSwitcher } from "./campus-switcher";
import { NotificationBell } from "./notification-bell";
import { NavTree } from "./sidebar";
import { useShell } from "./shell-context";
import { UserMenu } from "./user-menu";

function MobileNav() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
        <Menu />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-[18rem] flex-col gap-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main navigation menu</SheetDescription>
          <div className="flex h-header items-center px-4">
            <Logo />
          </div>
          <div className="px-3 pb-2">
            <WorkspaceSwitcher collapsed={false} />
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-2">
            <NavTree collapsed={false} onNavigate={() => setOpen(false)} />
          </nav>
          <div className="border-t px-3 py-3">
            <Link href="/help" onClick={() => setOpen(false)} className="flex h-9 items-center rounded-md px-2 text-small font-medium text-sidebar-foreground hover:bg-sidebar-accent">
              {t("nav.help")}
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function Header() {
  const { t } = useI18n();
  const { setCommandOpen } = useShell();

  return (
    <header className="sticky top-0 z-(--z-header) flex h-header shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 sm:px-4 lg:px-6">
      <MobileNav />
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="hidden h-8 w-64 items-center gap-2 rounded-md border bg-muted/50 px-2.5 text-small text-subtle-foreground transition-colors outline-none hover:border-border-strong hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring md:flex xl:w-80"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate text-start">{t("shell.search")}</span>
        <kbd className="rounded border bg-card px-1.5 text-[0.6875rem] font-medium text-muted-foreground">Ctrl K</kbd>
      </button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setCommandOpen(true)} aria-label={t("common.search")}>
        <Search />
      </Button>

      <NotificationBell />
      <div className="lg:hidden">
        <UserMenu variant="header" />
      </div>
    </header>
  );
}
