"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api-client";

export function SetupActions({ allDone }: { allDone: boolean }) {
  const router = useRouter();
  const go = async (action: "complete" | "dismiss") => {
    try {
      toast.success((await api.post("/api/onboarding", { action })).message);
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-4">
      <p className="text-small text-muted-foreground">{allDone ? "Everything's in place." : "You can finish the remaining steps later."}</p>
      <div className="flex gap-2">
        {!allDone && (
          <Button variant="ghost" onClick={() => go("dismiss")}>
            Hide reminder
          </Button>
        )}
        <Button variant={allDone ? "default" : "outline"} onClick={() => go("complete")}>
          {allDone ? "Finish setup" : "Mark setup as done"}
        </Button>
      </div>
    </div>
  );
}
