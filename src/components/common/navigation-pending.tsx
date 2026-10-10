"use client";

import { useCallback, useEffect, useId, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";

// Transitions that are still loading anywhere on the page. One bar for all of them.
const active = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Reports a transition's pending state to the shared top progress bar. */
export function usePublishPending(pending: boolean) {
  const id = useId();
  useEffect(() => {
    if (!pending) return;
    active.add(id);
    emit();
    return () => {
      active.delete(id);
      emit();
    };
  }, [id, pending]);
}

/** Thin bar along the top of the window while any published transition is pending. */
export function NavigationPendingBar() {
  const pending = useSyncExternalStore(subscribe, () => active.size > 0, () => false);
  return pending ? <span aria-hidden data-nav-progress className="nav-progress" /> : null;
}

/** `router.push` inside a transition, with progress feedback while the next page loads. */
export function usePendingRouter() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  usePublishPending(pending);
  const push = useCallback((href: string) => startTransition(() => router.push(href)), [router]);
  return { push, prefetch: router.prefetch, pending };
}
