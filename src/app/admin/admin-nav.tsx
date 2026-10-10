"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/plans", label: "Plans" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Platform" className="no-scrollbar flex gap-1 overflow-x-auto">
      {LINKS.map((l) => {
        const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-small font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminSignOut() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await api.post("/api/auth/logout");
        } finally {
          router.replace("/login");
          router.refresh();
        }
      }}
    >
      <LogOut /> Sign out
    </Button>
  );
}
