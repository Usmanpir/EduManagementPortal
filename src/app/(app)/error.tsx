"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/empty-state";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Details stay in the console/server logs; the user only sees a friendly message.
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="This page didn't load"
      description="Something went wrong while loading this page. Your data is safe — please try again."
      action={
        <Button variant="outline" onClick={reset}>
          <RotateCw /> Try again
        </Button>
      }
    />
  );
}
