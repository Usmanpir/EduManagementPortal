"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { useUrlState } from "./use-url-state";

export function Pagination({ page, pageSize, total, noun = "results" }: { page: number; pageSize: number; total: number; noun?: string }) {
  const { set, pending } = useUrlState();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 px-1 py-3">
      <p className="text-small text-muted-foreground tabular" aria-live="polite">
        {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)} {noun}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-1.5">
          <span className="me-2 hidden text-small text-muted-foreground sm:inline tabular">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={page <= 1 || pending}
            onClick={() => set({ page: String(page - 1) }, { scroll: true })}
          >
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={page >= pages || pending}
            onClick={() => set({ page: String(page + 1) }, { scroll: true })}
          >
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </div>
      )}
    </nav>
  );
}
