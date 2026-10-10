"use client";

import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/components/common/option-select";

export function CampusPicker({ campuses, value }: { campuses: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  return (
    <div className="w-48">
      <OptionSelect ariaLabel="Campus" value={value} onChange={(v) => v && router.replace(`/attendance/staff/qr?campus=${v}`)} options={campuses.map((c) => ({ value: c.id, label: c.name }))} />
    </div>
  );
}

export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer /> Print
    </Button>
  );
}
