"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellOff, CheckCheck, Settings } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { NotificationRow } from "@/components/shell/notification-bell";
import { useUrlState } from "@/components/data/use-url-state";
import { api, errorMessage } from "@/lib/api-client";

type Item = { id: string; type: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

/** Day heading in the organization's timezone, so server and browser agree: Today, Yesterday, then dates. */
function dayLabel(iso: string, today: string, timeZone: string) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${ymd}T00:00:00Z`)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: diff < 7 ? "long" : undefined, day: "numeric", month: "long", year: ymd.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" });
}

export function NotificationsView({ initial, nextCursor, unread: initialUnread, unreadOnly, canSettings, today, timezone }: { initial: Item[]; nextCursor: string | null; unread: number; unreadOnly: boolean; canSettings: boolean; today: string; timezone: string }) {
  const router = useRouter();
  const { set } = useUrlState();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [unread, setUnread] = useState(initialUnread);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const { data } = await api.get<{ items: Item[]; nextCursor: string | null }>(`/api/notifications?limit=30&cursor=${cursor}${unreadOnly ? "&unread=true" : ""}`);
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const markAll = async () => {
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
    setUnread(0);
    try {
      await api.post("/api/notifications/read", { all: true });
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const openItem = (item: Item) => {
    if (!item.readAt) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, readAt: new Date().toISOString() } : i)));
      setUnread((u) => Math.max(0, u - 1));
      void api.post("/api/notifications/read", { ids: [item.id] }).catch(() => undefined);
    }
    if (item.link) router.push(item.link);
  };

  const groups: { label: string; items: Item[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.createdAt, today, timezone);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up."}
        actions={
          <>
            {canSettings && (
              <Button variant="outline" asChild>
                <Link href="/settings/notifications">
                  <Settings /> Settings
                </Link>
              </Button>
            )}
            <Button variant="outline" onClick={markAll} disabled={unread === 0}>
              <CheckCheck /> Mark all read
            </Button>
          </>
        }
      />
      <div role="tablist" aria-label="Filter" className="flex gap-1 rounded-lg bg-muted p-1 self-start">
        {[
          { key: false, label: "All" },
          { key: true, label: `Unread${unread ? ` (${unread})` : ""}` },
        ].map((t) => (
          <button
            key={String(t.key)}
            role="tab"
            type="button"
            aria-selected={unreadOnly === t.key}
            onClick={() => set({ filter: t.key ? "unread" : null })}
            className={cn("rounded-md px-3 py-1 text-small font-medium", unreadOnly === t.key ? "bg-card shadow-xs" : "text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={BellOff} title={unreadOnly ? "No unread notifications" : "No notifications yet"} description="Attendance alerts, fee reminders, results and announcements will show up here." />
      ) : (
        groups.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h2 className="mb-1.5 px-1 text-caption font-medium tracking-wide text-muted-foreground uppercase">{g.label}</h2>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
              {g.items.map((item) => (
                <li key={item.id}>
                  <NotificationRow item={item} onOpen={openItem} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {cursor && (
        <Button variant="outline" className="self-center" loading={loading} onClick={loadMore}>
          Load older
        </Button>
      )}
    </div>
  );
}
