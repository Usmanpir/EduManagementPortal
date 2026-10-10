import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-primary-subtle text-primary-subtle-foreground">
          <Compass className="size-6" />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">We couldn&apos;t find that page</h1>
          <p className="text-muted-foreground">The link may be outdated, or the record may have been archived.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/">Home</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
