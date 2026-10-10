"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import type { SettingsSection } from "./settings-nav";

export function SettingsSidebar({ sections }: { sections: SettingsSection[] }) {
  const pathname = usePathname();
  const groups = [...new Set(sections.map((s) => s.group))];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Phones/tablets: horizontally scrollable tabs */}
      <nav aria-label="Settings" className="no-scrollbar -mx-4 mb-5 flex gap-1 overflow-x-auto border-b px-4 lg:hidden">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            aria-current={isActive(s.href) ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-small font-medium whitespace-nowrap transition-colors",
              isActive(s.href) ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {/* Desktop: grouped vertical list */}
      <nav aria-label="Settings" className="sticky top-20 hidden w-56 shrink-0 flex-col gap-5 self-start lg:flex">
        {groups.map((group) => (
          <div key={group} className="flex flex-col gap-0.5">
            <p className="px-2.5 pb-1 text-caption font-medium tracking-wide text-subtle-foreground uppercase">{group}</p>
            {sections
              .filter((s) => s.group === group)
              .map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  aria-current={isActive(s.href) ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-small font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive(s.href) ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {s.label}
                </Link>
              ))}
          </div>
        ))}
      </nav>
    </>
  );
}
