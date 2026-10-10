"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheck, LogIn, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api-client";

export function CheckInPanel({ campusId, token, campusName, firstName, isStaff }: { campusId: string; token: string; campusName: string; firstName: string; isStaff: boolean }) {
  const [state, setState] = useState<{ kind: "idle" | "busy" | "done" | "error"; message?: string }>({ kind: "idle" });

  const checkIn = async () => {
    setState({ kind: "busy" });
    try {
      const { message } = await api.post("/api/attendance/check-in", { campusId, token });
      setState({ kind: "done", message });
    } catch (error) {
      setState({ kind: "error", message: errorMessage(error) });
    }
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-5 py-10 text-center">
      {state.kind === "done" ? (
        <>
          <span className="grid size-16 animate-pop place-items-center rounded-full bg-success-subtle text-success-foreground">
            <CircleCheck className="size-8" />
          </span>
          <div>
            <h1 className="text-h1">Thanks, {firstName}</h1>
            <p className="mt-1 text-muted-foreground">{state.message}</p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </>
      ) : (
        <>
          <span className="grid size-16 place-items-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
            <LogIn className="size-8" />
          </span>
          <div>
            <h1 className="text-h1">Check in at {campusName}</h1>
            <p className="mt-1 text-muted-foreground">Scan again when you leave to record your check-out time.</p>
          </div>
          {!isStaff && <p className="text-small text-warning-foreground">Your account isn&apos;t linked to a staff record, so check-in isn&apos;t available.</p>}
          {state.kind === "error" && (
            <p role="alert" className="flex items-center gap-2 text-small text-danger-foreground">
              <TriangleAlert className="size-4" /> {state.message}
            </p>
          )}
          <Button size="xl" className="w-full" onClick={checkIn} loading={state.kind === "busy"} disabled={!isStaff}>
            Check in now
          </Button>
        </>
      )}
    </div>
  );
}
