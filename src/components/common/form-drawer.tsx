"use client";

import { Direction } from "radix-ui";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Side drawer for quick create/edit flows. The form lives in the scrollable
 * body; the footer actions stay visible and submit it via the `form` attribute.
 */
export function FormDrawer({
  open,
  onOpenChange,
  title,
  description,
  formId,
  submitLabel = "Save",
  submitting = false,
  size = "md",
  footerExtra,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  formId: string;
  submitLabel?: string;
  submitting?: boolean;
  size?: "md" | "lg";
  footerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const dir = Direction.useDirection();
  return (
    <Sheet open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <SheetContent
        side={dir === "rtl" ? "left" : "right"}
        className={cn("w-full gap-0 p-0 sm:max-w-lg", size === "lg" && "sm:max-w-2xl")}
        onInteractOutside={(e) => submitting && e.preventDefault()}
      >
        <SheetHeader className="border-b px-5 py-4 pe-12">
          <SheetTitle className="text-h2">{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{title}</SheetDescription>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        <div className="flex items-center gap-2 border-t bg-muted/30 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {footerExtra}
          <div className="ms-auto flex gap-2">
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={submitting}>
              {submitLabel}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
