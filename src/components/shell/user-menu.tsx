"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ChevronsUpDown, CreditCard, Languages, LifeBuoy, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/common/person-avatar";
import { useI18n } from "@/components/providers/i18n-provider";
import { api, errorMessage } from "@/lib/api-client";
import { LOCALES } from "@/lib/i18n";
import { useShell } from "./shell-context";

export function useLogout() {
  const router = useRouter();
  return async () => {
    try {
      await api.post("/api/auth/logout");
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };
}

export function UserMenu({ variant = "sidebar", collapsed = false }: { variant?: "sidebar" | "header"; collapsed?: boolean }) {
  const { t, locale } = useI18n();
  const { user, can, roleNames } = useShell();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const logout = useLogout();

  const changeLocale = async (next: string) => {
    try {
      await api.put("/api/me/preferences", { locale: next });
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "header" ? (
          <button
            type="button"
            aria-label={t("shell.profile")}
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PersonAvatar name={user.name} src={user.avatarUrl} size="sm" />
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-start outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            )}
            aria-label={t("shell.profile")}
          >
            <PersonAvatar name={user.name} src={user.avatarUrl} size="sm" />
            {!collapsed && (
              <>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-small font-medium text-foreground">{user.name}</span>
                  <span className="truncate text-caption text-muted-foreground">{roleNames[0] ?? user.email}</span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={variant === "header" ? "end" : "start"} side={variant === "sidebar" ? "top" : "bottom"} className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
          <PersonAvatar name={user.name} src={user.avatarUrl} size="md" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-small font-medium">{user.name}</span>
            <span className="truncate text-caption font-normal text-muted-foreground">{user.email}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound /> {t("shell.profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" />
            {t("shell.theme")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun /> {t("shell.themeLight")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon /> {t("shell.themeDark")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor /> {t("shell.themeSystem")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages /> {t("shell.language")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={locale} onValueChange={changeLocale}>
              {LOCALES.map((l) => (
                <DropdownMenuRadioItem key={l.code} value={l.code}>
                  {l.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {can("billing.view") && (
          <DropdownMenuItem asChild>
            <Link href="/settings/billing">
              <CreditCard /> {t("nav.subscription")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/help">
            <LifeBuoy /> {t("nav.help")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={logout}>
          <LogOut /> {t("shell.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
