"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building, Check, ChevronsUpDown, Globe } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/components/providers/i18n-provider";
import { api, errorMessage } from "@/lib/api-client";
import { useShell } from "./shell-context";

export function useSwitchCampus() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const switchTo = (campusId: string | null) =>
    startTransition(async () => {
      try {
        await api.put("/api/auth/campus", { campusId });
        router.refresh();
      } catch (error) {
        toast.error(errorMessage(error));
      }
    });
  return { switchTo, pending };
}

/** Organization + campus block at the top of the sidebar. */
export function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n();
  const { organization, campuses, campusId, canViewAllCampuses } = useShell();
  const { switchTo, pending } = useSwitchCampus();
  const current = campuses.find((c) => c.id === campusId);
  const label = current?.name ?? t("common.allCampuses");
  const showMenu = campuses.length > 1 || (campuses.length === 1 && canViewAllCampuses && !!campusId);

  const trigger = (
    <button
      type="button"
      disabled={!showMenu}
      aria-label={`${organization.name} — ${label}`}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-lg p-1.5 text-start transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:hover:bg-transparent",
        pending && "opacity-60",
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-small font-semibold text-primary-foreground shadow-xs">
        {organization.name.slice(0, 1).toUpperCase()}
      </span>
      {!collapsed && (
        <>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-small font-semibold text-foreground">{organization.name}</span>
            <span className="truncate text-caption text-muted-foreground">{label}</span>
          </span>
          {showMenu && <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />}
        </>
      )}
    </button>
  );

  if (!showMenu) {
    return collapsed ? (
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="right">{organization.name}</TooltipContent>
      </Tooltip>
    ) : (
      trigger
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={collapsed ? "right" : "bottom"} className="w-64">
        <DropdownMenuLabel className="text-caption text-muted-foreground">{t("shell.switchCampus")}</DropdownMenuLabel>
        {canViewAllCampuses && (
          <>
            <DropdownMenuItem onSelect={() => switchTo(null)}>
              <Globe />
              <span className="flex-1">{t("shell.organizationView")}</span>
              {!campusId && <Check className="text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {campuses.map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => switchTo(c.id)}>
            <Building />
            <span className="flex-1 truncate">{c.name}</span>
            {c.id === campusId && <Check className="text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
