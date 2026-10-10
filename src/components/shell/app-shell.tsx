"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Sparkles, TriangleAlert } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { NavigationPendingBar } from "@/components/common/navigation-pending";
import { BottomNav } from "./bottom-nav";
import { CommandPalette } from "./command-palette";
import { Header } from "./header";
import { ShellProvider, useShell, type ShellData } from "./shell-context";
import { Sidebar } from "./sidebar";

function Banners() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { setupIncomplete, subscription, can } = useShell();

  if (subscription && (subscription.status === "SUSPENDED" || subscription.status === "PAST_DUE")) {
    const suspended = subscription.status === "SUSPENDED";
    return (
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-danger/20 bg-danger-subtle px-4 py-2 text-small text-danger-foreground lg:px-6">
        <TriangleAlert className="size-4 shrink-0" />
        <span className="flex-1">
          {suspended
            ? "Your subscription is suspended — EduAttend is read-only until billing is updated."
            : "Your last payment didn't go through. Update billing to avoid interruption."}
        </span>
        {can("billing.view") && (
          <Link href="/settings/billing" className="font-semibold underline-offset-4 hover:underline">
            Review billing
          </Link>
        )}
      </div>
    );
  }

  if (setupIncomplete && can("settings.manage") && !pathname.startsWith("/onboarding")) {
    return (
      <div role="status" className="flex items-center gap-3 border-b bg-primary-subtle px-4 py-2 text-small text-primary-subtle-foreground lg:px-6">
        <Sparkles className="size-4 shrink-0" />
        <span className="flex-1">{t("shell.setupIncomplete")}</span>
        <Link href="/onboarding" className="inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline">
          {t("shell.finishSetup")} <ArrowRight className="size-3.5 rtl:rotate-180" />
        </Link>
      </div>
    );
  }
  return null;
}

export function AppShell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  return (
    <ShellProvider data={data}>
      <a
        href="#main"
        className="sr-only z-(--z-toast) rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:inset-s-3"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh bg-canvas">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col lg:h-dvh lg:py-2 lg:pe-2">
          <div
            data-scroll-root
            className="flex min-h-dvh flex-1 flex-col bg-background lg:min-h-0 lg:overflow-y-auto lg:rounded-xl lg:border lg:shadow-xs"
          >
            <Header />
            <Banners />
            <main id="main" tabIndex={-1} className="flex-1 px-4 pt-5 pb-24 outline-none sm:px-6 md:pb-10 lg:px-8 lg:pt-7">
              <div className="mx-auto w-full max-w-content">{children}</div>
            </main>
          </div>
        </div>
      </div>
      <BottomNav />
      <CommandPalette />
      <NavigationPendingBar />
    </ShellProvider>
  );
}
