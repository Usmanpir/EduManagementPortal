"use client";

import { useLinkStatus } from "next/link";

/**
 * Place inside a `<Link>`: while that navigation is pending, a thin progress bar
 * runs along the top of the window. Next.js only reports the most recently clicked
 * link as pending, so one bar shows at a time. Fixed-positioned, so no layout shift.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span aria-hidden data-nav-progress className="nav-progress" />;
}
