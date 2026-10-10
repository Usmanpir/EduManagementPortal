import type { Metadata } from "next";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "No access", robots: { index: false } };

export default function ForbiddenPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-warning-subtle text-warning-foreground">
          <ShieldX className="size-6" />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">You don&apos;t have access to this page</h1>
          <p className="text-muted-foreground">
            Your role doesn&apos;t include permission for this area. If you need it, ask your school administrator.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
