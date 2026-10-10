"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, History, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge, type StatusKey } from "@/components/attendance/status";
import { useUrlState } from "@/components/data/use-url-state";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";

type Row = { id: string; date: string; student: string; section: string; from: StatusKey; to: StatusKey; reason: string; requestedBy: string; reviewedBy: string | null; status: string };

export function CorrectionsView({ rows, status, canReview }: { rows: Row[]; status: string; canReview: boolean }) {
  const router = useRouter();
  const { set } = useUrlState();
  const [busy, setBusy] = useState<string | null>(null);

  const review = async (id: string, decision: "APPROVED" | "REJECTED") => {
    setBusy(id);
    try {
      toast.success((await api.post(`/api/attendance/corrections/${id}`, { decision })).message);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader title="Attendance corrections" description="Changes requested to registers after they were locked." />
      <div role="tablist" aria-label="Status" className="mb-4 flex gap-1 border-b">
        {["PENDING", "APPROVED", "REJECTED"].map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={status === s}
            onClick={() => set({ status: s === "PENDING" ? null : s })}
            className={cn("-mb-px border-b-2 px-3 py-2.5 text-small font-medium", status === s ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={History} title={status === "PENDING" ? "No corrections waiting" : "Nothing here yet"} description="When a teacher asks to change a locked register, it appears here for approval." />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {r.student} <span className="font-normal text-muted-foreground">· {r.section} · {formatDate(r.date)}</span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-small">
                  <StatusBadge status={r.from} /> <ArrowRight className="size-3.5 text-muted-foreground rtl:rotate-180" /> <StatusBadge status={r.to} />
                </p>
                <p className="mt-1 text-small text-muted-foreground">
                  “{r.reason}” — {r.requestedBy}
                  {r.reviewedBy && ` · reviewed by ${r.reviewedBy}`}
                </p>
              </div>
              {status === "PENDING" && canReview && (
                <div className="flex gap-2">
                  <Button size="sm" loading={busy === r.id} onClick={() => review(r.id, "APPROVED")}>
                    <Check /> Approve
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => review(r.id, "REJECTED")}>
                    <X /> Reject
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
