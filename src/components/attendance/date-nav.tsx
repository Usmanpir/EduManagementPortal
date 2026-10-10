"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/common/date-pickers";
import { addDays } from "@/lib/format";

/** Previous / date / next / today control that keeps the date in the URL. */
export function DateNav({ date, today, allowFuture = false }: { date: string; today: string; allowFuture?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const go = (d: string) => {
    const p = new URLSearchParams(searchParams.toString());
    if (d === today) p.delete("date");
    else p.set("date", d);
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => go(addDays(date, -1))}>
        <ChevronLeft className="rtl:rotate-180" />
      </Button>
      <DatePicker value={date} max={allowFuture ? undefined : today} onChange={(v) => v && go(v)} ariaLabel="Date" className="w-[10.5rem]" />
      <Button variant="outline" size="icon" aria-label="Next day" disabled={!allowFuture && date >= today} onClick={() => go(addDays(date, 1))}>
        <ChevronRight className="rtl:rotate-180" />
      </Button>
      {date !== today && (
        <Button variant="ghost" onClick={() => go(today)}>
          Today
        </Button>
      )}
    </div>
  );
}
