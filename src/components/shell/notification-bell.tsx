"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellOff,
  CalendarX2,
  CheckCheck,
  Clock3,
  FileText,
  Megaphone,
  NotebookPen,
  Plane,
  TrendingDown,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { RelativeTime } from "@/components/common/relative-time";
import { useI18n } from "@/components/providers/i18n-provider";
import { api } from "@/lib/api-client";
import { useShell } from "./shell-context";

type Item = { id: string; type: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

const ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  "attendance.absent": { icon: CalendarX2, tone: "bg-danger-subtle text-danger-foreground" },
  "attendance.late": { icon: Clock3, tone: "bg-warning-subtle text-warning-foreground" },
  "attendance.low": { icon: TrendingDown, tone: "bg-warning-subtle text-warning-foreground" },
  "attendance.pending": { icon: Clock3, tone: "bg-info-subtle text-info-foreground" },
  "fee.payment": { icon: Wallet, tone: "bg-success-subtle text-success-foreground" },
  "fee.reminder": { icon: Wallet, tone: "bg-warning-subtle text-warning-foreground" },
  "fee.overdue": { icon: Wallet, tone: "bg-danger-subtle text-danger-foreground" },
  "leave.requested": { icon: Plane, tone: "bg-info-subtle text-info-foreground" },
  "leave.reviewed": { icon: Plane, tone: "bg-primary-subtle text-primary-subtle-foreground" },
  announcement: { icon: Megaphone, tone: "bg-primary-subtle text-primary-subtle-foreground" },
  "exam.scheduled": { icon: NotebookPen, tone: "bg-primary-subtle text-primary-subtle-foreground" },
  "result.published": { icon: FileText, tone: "bg-success-subtle text-success-foreground" },
  "import.completed": { icon: Upload, tone: "bg-info-subtle text-info-foreground" },
};

export function NotificationIcon({ type, className }: { type: string; className?: string }) {
  const def = ICONS[type] ?? { icon: Bell, tone: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", def.tone, className)}>
      <def.icon className="size-4" aria-hidden />
    </span>
  );
}

export function NotificationRow({ item, onOpen }: { item: Item; onOpen?: (item: Item) => void }) {
  const content = (
    <>
      <NotificationIcon type={item.type} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-small", item.readAt ? "font-medium" : "font-semibold")}>{item.title}</span>
          {!item.readAt && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
        </span>
        <span className="line-clamp-2 text-small text-muted-foreground">{item.body}</span>
        <RelativeTime date={item.createdAt} className="text-caption text-subtle-foreground" />
      </span>
    </>
  );
  const className = cn(
    "flex w-full items-start gap-3 px-4 py-3 text-start transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60",
    !item.readAt && "bg-primary-subtle/40",
  );
  return (
    <button type="button" className={className} onClick={() => onOpen?.(item)}>
      {content}
    </button>
  );
}

export function NotificationBell() {
  const { t } = useI18n();
  const router = useRouter();
  const { unreadNotifications } = useShell();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [unread, setUnread] = useState(unreadNotifications);
  // Adopt the server count whenever the page re-renders with a new one.
  const [serverUnread, setServerUnread] = useState(unreadNotifications);
  if (serverUnread !== unreadNotifications) {
    setServerUnread(unreadNotifications);
    setUnread(unreadNotifications);
  }

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ items: Item[]; unread: number }>("/api/notifications?limit=12");
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      setItems([]);
    }
  }, []);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void load();
  };

  const markAll = async () => {
    setItems((prev) => prev?.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) ?? prev);
    setUnread(0);
    await api.post("/api/notifications/read", { all: true }).catch(() => load());
  };

  const openItem = async (item: Item) => {
    if (!item.readAt) {
      setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, readAt: new Date().toISOString() } : i)) ?? prev);
      setUnread((u) => Math.max(0, u - 1));
      void api.post("/api/notifications/read", { ids: [item.id] }).catch(() => undefined);
    }
    if (item.link) {
      setOpen(false);
      router.push(item.link);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`${t("shell.notifications")}${unread ? ` (${unread} unread)` : ""}`}>
          <Bell />
          {unread > 0 && (
            <span className="absolute top-1 inset-e-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.625rem] font-semibold text-on-danger ring-2 ring-background tabular">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-h3">{t("shell.notifications")}</p>
          <Button variant="ghost" size="xs" onClick={markAll} disabled={unread === 0}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <div className="max-h-[min(28rem,70dvh)] overflow-y-auto">
          {items === null ? (
            <div className="flex flex-col gap-4 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-8 rounded-lg" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <BellOff className="size-4" />
              </span>
              <p className="text-small font-medium">You&apos;re all caught up</p>
              <p className="text-caption text-muted-foreground">Absences, payments, leave requests and announcements appear here.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id}>
                  <NotificationRow item={item} onOpen={openItem} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t p-1.5">
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link href="/notifications" onClick={() => setOpen(false)}>
              {t("common.viewAll")}
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
