"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PermissionKey } from "@/lib/permissions";

export type ShellData = {
  user: { id: string; name: string; firstName: string; email: string; initials: string; avatarUrl: string | null };
  organization: { name: string; logoUrl: string | null };
  campuses: { id: string; name: string }[];
  campusId: string | null;
  canViewAllCampuses: boolean;
  permissions: PermissionKey[];
  roleNames: string[];
  portal: boolean;
  unreadNotifications: number;
  subscription: { status: string; planName: string; trialDaysLeft: number | null } | null;
  setupIncomplete: boolean;
  sidebarCollapsed: boolean;
};

type ShellContextValue = ShellData & {
  can: (...perms: PermissionKey[]) => boolean;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  /** Human labels for dynamic route segments (ids → names) used by breadcrumbs. */
  crumbLabels: Record<string, string>;
  setCrumbLabel: (segment: string, label: string) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [crumbLabels, setCrumbLabels] = useState<Record<string, string>>({});
  const permissionSet = useMemo(() => new Set(data.permissions), [data.permissions]);

  const setCrumbLabel = useCallback((segment: string, label: string) => {
    setCrumbLabels((prev) => (prev[segment] === label ? prev : { ...prev, [segment]: label }));
  }, []);

  const value = useMemo<ShellContextValue>(
    () => ({
      ...data,
      can: (...perms) => perms.every((p) => permissionSet.has(p)),
      commandOpen,
      setCommandOpen,
      crumbLabels,
      setCrumbLabel,
    }),
    [data, permissionSet, commandOpen, crumbLabels, setCrumbLabel],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell must be used inside <ShellProvider>");
  return value;
}

/** Registers a readable breadcrumb label for a dynamic segment (e.g. a student id → "Muhammad Ali"). */
export function BreadcrumbLabel({ segment, label }: { segment: string; label: string }) {
  const { setCrumbLabel } = useShell();
  useEffect(() => setCrumbLabel(segment, label), [segment, label, setCrumbLabel]);
  return null;
}

/** True when the keyboard event originated in a text-entry control. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Single-key shortcut that never fires while the user is typing or when a
 * modifier key is held (so it can't hijack normal input or browser shortcuts).
 */
export function useHotkey(key: string, handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector("[role=dialog][data-state=open]")) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, handler, enabled]);
}
