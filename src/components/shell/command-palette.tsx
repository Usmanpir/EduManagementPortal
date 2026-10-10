"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePendingRouter } from "@/components/common/navigation-pending";
import {
  CalendarCheck2,
  FileText,
  GraduationCap,
  IdCard,
  Library,
  Loader2,
  Megaphone,
  Plus,
  Presentation,
  Receipt,
  Search,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Command as CommandPrimitive } from "cmdk";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/components/providers/i18n-provider";
import { api } from "@/lib/api-client";
import type { PermissionKey } from "@/lib/permissions";
import { useNavItems } from "./sidebar";
import { useShell } from "./shell-context";

type Result = { type: string; id: string; title: string; subtitle: string; href: string };

const ACTIONS: { label: string; href: string; icon: LucideIcon; perm: PermissionKey; keywords: string }[] = [
  { label: "Mark attendance", href: "/attendance", icon: CalendarCheck2, perm: "attendance.mark", keywords: "roll call register present absent" },
  { label: "Add student", href: "/students?new=1", icon: GraduationCap, perm: "students.create", keywords: "admission enroll new student" },
  { label: "Record payment", href: "/finance/payments?new=1", icon: Wallet, perm: "payments.record", keywords: "collect fee payment receipt" },
  { label: "Create invoice", href: "/finance/invoices?new=1", icon: Receipt, perm: "invoices.manage", keywords: "bill fee invoice" },
  { label: "Create announcement", href: "/communication/announcements?new=1", icon: Megaphone, perm: "announcements.manage", keywords: "notice message broadcast" },
  { label: "Create class", href: "/academics/classes?new=1", icon: Library, perm: "academics.manage", keywords: "grade class new" },
  { label: "Create exam", href: "/exams?new=1", icon: FileText, perm: "exams.manage", keywords: "test exam schedule" },
];

const RESULT_GROUPS: { type: string; heading: string; icon: LucideIcon }[] = [
  { type: "student", heading: "Students", icon: GraduationCap },
  { type: "teacher", heading: "Teachers", icon: Presentation },
  { type: "staff", heading: "Staff", icon: IdCard },
  { type: "class", heading: "Classes", icon: Library },
  { type: "invoice", heading: "Invoices", icon: Receipt },
];

const itemClass =
  "flex cursor-default items-center gap-3 rounded-md px-2.5 py-2 text-small outline-none select-none data-[selected=true]:bg-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";
const groupClass =
  "px-1.5 py-1 **:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:text-caption **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground";

export function CommandPalette() {
  const router = usePendingRouter();
  const { t } = useI18n();
  const { commandOpen, setCommandOpen, can } = useShell();
  const navItems = useNavItems();
  const [query, setQuery] = useState("");
  // Results are tagged with the query they answer; loading is derived from the mismatch.
  const [resolved, setResolved] = useState<{ q: string; results: Result[] }>({ q: "", results: [] });
  const trimmed = query.trim();
  const searching = trimmed.length >= 2;
  const results = searching && resolved.q === trimmed ? resolved.results : [];
  const loading = searching && resolved.q !== trimmed;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) setQuery("");
      setCommandOpen(open);
    },
    [setCommandOpen],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleOpenChange(!commandOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, handleOpenChange]);

  useEffect(() => {
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get<Result[]>(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        setResolved({ q: trimmed, results: data });
      } catch {
        if (!controller.signal.aborted) setResolved({ q: trimmed, results: [] });
      }
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmed]);

  const pages = useMemo(
    () =>
      navItems.flatMap((item) =>
        item.children?.length
          ? item.children.map((c) => ({ key: c.key, label: `${t(item.label)} › ${t(c.label)}`, href: c.href, icon: item.icon }))
          : [{ key: item.key, label: t(item.label), href: item.href, icon: item.icon }],
      ),
    [navItems, t],
  );

  const q = query.trim().toLowerCase();
  const actions = ACTIONS.filter((a) => can(a.perm) && (!q || `${a.label} ${a.keywords}`.toLowerCase().includes(q)));
  const visiblePages = pages.filter((p) => !q || p.label.toLowerCase().includes(q)).slice(0, q ? 6 : 8);

  const go = (href: string) => {
    handleOpenChange(false);
    router.push(href);
  };

  const empty = !loading && actions.length === 0 && visiblePages.length === 0 && results.length === 0;

  return (
    <Dialog open={commandOpen} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="top-[12dvh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Search EduAttend</DialogTitle>
        <DialogDescription className="sr-only">Search records, jump to pages or run quick actions.</DialogDescription>
        <CommandPrimitive shouldFilter={false} loop className="flex flex-col">
          <div className="flex items-center gap-2.5 border-b px-4">
            {loading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <Search className="size-4 text-muted-foreground" />
            )}
            <CommandPrimitive.Input
              value={query}
              onValueChange={setQuery}
              placeholder={t("shell.search")}
              className="h-12 flex-1 bg-transparent text-body outline-none placeholder:text-subtle-foreground"
            />
            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground sm:inline">Esc</kbd>
          </div>
          <CommandPrimitive.List className="max-h-[min(26rem,60dvh)] overflow-y-auto overscroll-contain py-1">
            {empty && <p className="px-4 py-10 text-center text-small text-muted-foreground">{t("common.noResults")}</p>}

            {RESULT_GROUPS.map((group) => {
              const items = results.filter((r) => r.type === group.type);
              if (!items.length) return null;
              return (
                <CommandPrimitive.Group key={group.type} heading={group.heading} className={groupClass}>
                  {items.map((r) => (
                    <CommandPrimitive.Item key={`${r.type}-${r.id}`} value={`${r.type}-${r.id}`} onSelect={() => go(r.href)} className={itemClass}>
                      <group.icon />
                      <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                      <span className="truncate text-caption text-muted-foreground">{r.subtitle}</span>
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              );
            })}

            {actions.length > 0 && (
              <CommandPrimitive.Group heading="Quick actions" className={groupClass}>
                {actions.map((a) => (
                  <CommandPrimitive.Item key={a.href} value={`action-${a.label}`} onSelect={() => go(a.href)} className={itemClass}>
                    <span className="grid size-6 place-items-center rounded-md bg-primary-subtle [&_svg]:text-primary-subtle-foreground!">
                      <Plus className="size-3.5!" />
                    </span>
                    <span className="flex-1">{a.label}</span>
                    <a.icon />
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            )}

            {visiblePages.length > 0 && (
              <CommandPrimitive.Group heading="Go to" className={groupClass}>
                {visiblePages.map((p) => (
                  <CommandPrimitive.Item key={p.key} value={`page-${p.key}`} onSelect={() => go(p.href)} className={itemClass}>
                    <p.icon />
                    <span className="flex-1">{p.label}</span>
                  </CommandPrimitive.Item>
                ))}
                {!q && can("settings.manage") && (
                  <CommandPrimitive.Item value="page-settings-general" onSelect={() => go("/settings")} className={itemClass}>
                    <Settings />
                    <span className="flex-1">{t("nav.settings")}</span>
                  </CommandPrimitive.Item>
                )}
              </CommandPrimitive.Group>
            )}
          </CommandPrimitive.List>
          <div className="flex items-center gap-4 border-t bg-muted/40 px-4 py-2 text-caption text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border bg-card px-1">↑</kbd>
              <kbd className="rounded border bg-card px-1">↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border bg-card px-1">↵</kbd> open
            </span>
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
