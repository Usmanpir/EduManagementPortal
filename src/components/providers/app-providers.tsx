"use client";

import { ThemeProvider } from "next-themes";
import { Direction } from "radix-ui";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Locale } from "@/lib/i18n";
import { I18nProvider } from "./i18n-provider";

export function AppProviders({
  children,
  locale,
  dir,
  nonce,
}: {
  children: React.ReactNode;
  locale: Locale;
  dir: "ltr" | "rtl";
  nonce?: string;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
      <Direction.Provider dir={dir}>
        <I18nProvider locale={locale}>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster position={dir === "rtl" ? "bottom-left" : "bottom-right"} dir={dir} />
          </TooltipProvider>
        </I18nProvider>
      </Direction.Provider>
    </ThemeProvider>
  );
}
