import type { Metadata } from "next";
import { requirePageContext } from "@/server/auth/context";
import { PrintToolbar } from "./print-toolbar";

/** Signed-in pages are private and never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Plain, printable pages (reports, invoices, report cards) — no app chrome. */
export default async function PrintLayout({ children }: LayoutProps<"/">) {
  await requirePageContext();
  return (
    <div className="min-h-dvh bg-canvas print:bg-white">
      <PrintToolbar />
      <main className="mx-auto max-w-4xl bg-card px-6 py-8 shadow-sm sm:my-6 sm:rounded-xl sm:border sm:px-10 print:my-0 print:max-w-none print:border-0 print:p-0 print:shadow-none">{children}</main>
    </div>
  );
}
