"use client";

import { useSyncExternalStore } from "react";
import { formatDistanceToNowStrict } from "date-fns";

// One shared minute ticker for every <RelativeTime> on the page.
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(callback: () => void) {
  listeners.add(callback);
  if (!timer) {
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 60_000);
  }
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const absolute = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * "5 minutes ago". The server (whose clock and timezone differ from the
 * viewer's) renders an empty placeholder; the text appears once hydrated,
 * so it never causes a hydration mismatch.
 */
export function RelativeTime({ date, className }: { date: string | Date; className?: string }) {
  const d = typeof date === "string" ? new Date(date) : date;
  const current = useSyncExternalStore(
    subscribe,
    () => now,
    () => null,
  );
  return (
    <time dateTime={d.toISOString()} title={current === null ? undefined : absolute.format(d)} className={className}>
      {current === null ? " " : formatDistanceToNowStrict(d, { addSuffix: true })}
    </time>
  );
}
