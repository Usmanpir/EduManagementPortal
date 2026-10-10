"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintToolbar() {
  const router = useRouter();
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background/90 px-4 py-2 backdrop-blur">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="rtl:rotate-180" /> Back
      </Button>
      <p className="hidden text-small text-muted-foreground sm:block">Use “Save as PDF” in the print dialog to download a PDF.</p>
      <Button size="sm" onClick={() => window.print()}>
        <Printer /> Print / Save PDF
      </Button>
    </div>
  );
}
