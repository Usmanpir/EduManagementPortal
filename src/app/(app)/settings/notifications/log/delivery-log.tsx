"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { SettingsCard } from "@/components/common/settings-card";
import { DataTable } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { api, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

type Row = { id: string; channel: string; recipient: string; template: string; status: string; attempts: number; error: string | null; provider: string | null; createdAt: string; sentAt: string | null };

const STATUS = {
  SENT: { label: "Sent", variant: "success" },
  PENDING: { label: "Queued", variant: "info" },
  FAILED: { label: "Failed", variant: "danger" },
  SKIPPED: { label: "Skipped", variant: "neutral" },
} as const;
const CHANNEL: Record<string, string> = { EMAIL: "Email", WHATSAPP: "WhatsApp", SMS: "SMS" };
const TEMPLATE: Record<string, string> = {
  attendance_absent: "Absence alert",
  attendance_late: "Late arrival",
  low_attendance: "Low attendance",
  fee_reminder: "Fee reminder",
  payment_receipt: "Payment receipt",
  leave_reviewed: "Leave decision",
  result_published: "Results published",
  announcement: "Announcement",
  daily_summary: "Daily summary",
  invitation: "Invitation",
  password_reset: "Password reset",
  welcome: "Welcome",
  exam_announcement: "Exam notice",
};

export function DeliveryLog({ rows, total, summary, page, pageSize, timezone }: { rows: Row[]; total: number; summary: Record<string, number>; page: number; pageSize: number; timezone: string }) {
  const router = useRouter();
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { id: "when", header: "When", meta: { alwaysVisible: true }, cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTime(row.original.createdAt, timezone)}</span> },
      { id: "what", header: "Message", meta: { label: "Message" }, cell: ({ row }) => TEMPLATE[row.original.template] ?? row.original.template },
      { id: "channel", header: "Channel", meta: { label: "Channel" }, cell: ({ row }) => CHANNEL[row.original.channel] ?? row.original.channel },
      { id: "to", header: "To", meta: { label: "To" }, cell: ({ row }) => <span className="tabular text-muted-foreground">{row.original.recipient}</span> },
      {
        id: "status",
        header: "Status",
        meta: { alwaysVisible: true },
        cell: ({ row: { original: r } }) => {
          const s = STATUS[r.status as keyof typeof STATUS] ?? STATUS.PENDING;
          return (
            <div>
              <Badge variant={s.variant} dot>
                {s.label}
              </Badge>
              {r.error && <p className="mt-0.5 max-w-64 truncate text-caption text-muted-foreground" title={r.error}>{r.error}</p>}
            </div>
          );
        },
      },
      { id: "attempts", header: "Tries", meta: { align: "end", label: "Tries" }, cell: ({ row }) => <span className="tabular">{row.original.attempts}</span> },
    ],
    [timezone],
  );

  const retry = async () => {
    try {
      toast.success((await api.post("/api/settings/deliveries")).message);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <SettingsCard
      title="Delivery log"
      description={`Every email, WhatsApp and SMS EduAttend tried to send. Last 30 days: ${summary.SENT ?? 0} sent, ${summary.PENDING ?? 0} queued, ${summary.FAILED ?? 0} failed, ${summary.SKIPPED ?? 0} skipped.`}
    >
      {total === 0 && !rows.length ? (
        <EmptyState icon={Send} title="Nothing sent yet" description="External messages appear here once email, WhatsApp or SMS is switched on." className="border-0" />
      ) : (
        <DataTable
          filters={
            <FilterBar
              filters={[
                { key: "status", label: "Status", multiple: true, options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })) },
                { key: "channel", label: "Channel", multiple: true, options: Object.entries(CHANNEL).map(([value, label]) => ({ value, label })) },
              ]}
              actions={
                (summary.FAILED ?? 0) > 0 && (
                  <Button variant="outline" size="sm" onClick={retry}>
                    <RotateCcw /> Retry failed
                  </Button>
                )
              }
            />
          }
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          pagination={{ page, pageSize, total, noun: "messages" }}
          caption="Message deliveries"
          mobileCard={(r) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{TEMPLATE[r.template] ?? r.template}</p>
                <p className="text-small text-muted-foreground">
                  {CHANNEL[r.channel]} · {r.recipient}
                </p>
                <p className="text-caption text-muted-foreground">{formatDateTime(r.createdAt, timezone)}</p>
              </div>
              <Badge variant={(STATUS[r.status as keyof typeof STATUS] ?? STATUS.PENDING).variant}>{(STATUS[r.status as keyof typeof STATUS] ?? STATUS.PENDING).label}</Badge>
            </div>
          )}
          empty={<EmptyState icon={Send} title="No messages match" description="Try different filters." className="border-0" />}
        />
      )}
    </SettingsCard>
  );
}
