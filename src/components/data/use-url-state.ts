"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePublishPending } from "@/components/common/navigation-pending";

/**
 * List pages keep their state (search, filters, sort, page) in the URL so the
 * server can do filtering/pagination and links are shareable.
 */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  usePublishPending(pending);

  const get = useCallback((key: string) => searchParams.get(key), [searchParams]);
  const getAll = useCallback((key: string) => searchParams.get(key)?.split(",").filter(Boolean) ?? [], [searchParams]);

  /** Applies updates; null/empty removes a key. Any change other than `page` resets to page 1. */
  const set = useCallback(
    (updates: Record<string, string | string[] | null | undefined>, opts: { scroll?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams.toString());
      let resetPage = false;
      for (const [key, value] of Object.entries(updates)) {
        const v = Array.isArray(value) ? value.join(",") : value;
        if (v === null || v === undefined || v === "") next.delete(key);
        else next.set(key, v);
        if (key !== "page") resetPage = true;
      }
      if (resetPage) next.delete("page");
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: opts.scroll ?? false }));
    },
    [pathname, router, searchParams],
  );

  return { get, getAll, set, pending, searchParams };
}
