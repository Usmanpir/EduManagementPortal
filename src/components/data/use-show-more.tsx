"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Long lists inside a page grow in steps instead of scrolling inside a fixed-height
 * box (which gives the page two scrollbars). Returns how many rows to render and a
 * footer with the "Show more" button.
 */
export function useShowMore(total: number, { step = 25, max = Infinity }: { step?: number; max?: number } = {}) {
  const [count, setCount] = useState(step);
  const available = Math.min(total, max);
  const shown = Math.min(count, available);
  const footer =
    shown < available ? (
      <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5">
        <span className="text-caption text-muted-foreground tabular">
          Showing {shown} of {available}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setCount((c) => c + step)}>
          Show {Math.min(step, available - shown)} more
        </Button>
      </div>
    ) : null;
  return { shown, footer };
}
