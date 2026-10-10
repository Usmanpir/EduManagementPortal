"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Plane, Plus, X } from "lucide-react";
import { Controller, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { PageHeader } from "@/components/common/page-header";
import { PersonAvatar } from "@/components/common/person-avatar";
import { useApiForm } from "@/components/common/use-api-form";
import { StudentPicker } from "@/components/people/student-picker";
import { Pagination } from "@/components/data/pagination";
import { useUrlState } from "@/components/data/use-url-state";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { LEAVE_TYPES, leaveRequestSchema } from "@/lib/validation/attendance";
import { FormDatePicker } from "@/components/common/date-pickers";

type Row = {
  id: string;
  requesterType: "STUDENT" | "STAFF";
  person: string;
  detail: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  requestedBy: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  canReview: boolean;
  canCancel: boolean;
};
type Subjects = { self: { staffId: string } | null; children: { id: string; name: string }[]; canFileForOthers: boolean };

const TYPE_LABELS: Record<string, string> = { SICK: "Sick", CASUAL: "Casual", ANNUAL: "Annual", EMERGENCY: "Emergency", MATERNITY: "Maternity", OTHER: "Other" };
const STATUS_BADGE = {
  PENDING: { label: "Pending", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Rejected", variant: "danger" },
  CANCELLED: { label: "Cancelled", variant: "neutral" },
} as const;

function RequestDrawer({ open, onOpenChange, subjects }: { open: boolean; onOpenChange: (o: boolean) => void; subjects: Subjects }) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultType = subjects.self ? "STAFF" : "STUDENT";
  const { form, onSubmit, formError, submitting } = useApiForm({
    schema: leaveRequestSchema,
    defaultValues: { requesterType: defaultType, studentId: subjects.children[0]?.id ?? null, staffId: null, type: "SICK", startDate: today, endDate: today, reason: "" },
    submit: (v) => api.post("/api/leave", v),
    onSuccess: () => onOpenChange(false),
  });
  const { register, control, formState: { errors } } = form;
  const requesterType = useWatch({ control, name: "requesterType" });
  const forOptions = [
    ...(subjects.self ? [{ value: "STAFF", label: "Myself" }] : []),
    ...(subjects.children.length || subjects.canFileForOthers ? [{ value: "STUDENT", label: subjects.children.length ? "My child" : "A student" }] : []),
  ];

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Request leave" description="Approved leave is excused and won't count against attendance." formId="leave-form" submitLabel="Submit request" submitting={submitting}>
      <form id="leave-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormAlert>{formError}</FormAlert>
        {forOptions.length > 1 && (
          <Field label="Leave for" htmlFor="requesterType">
            <Controller control={control} name="requesterType" render={({ field }) => <OptionSelect id="requesterType" value={field.value} onChange={(v) => field.onChange(v ?? defaultType)} options={forOptions} />} />
          </Field>
        )}
        {requesterType === "STUDENT" && (
          <Field label={subjects.children.length ? "Child" : "Student"} htmlFor="studentId" error={errors.studentId?.message} required>
            <Controller
              control={control}
              name="studentId"
              render={({ field }) =>
                subjects.children.length ? (
                  <OptionSelect id="studentId" value={field.value} onChange={field.onChange} options={subjects.children.map((c) => ({ value: c.id, label: c.name }))} />
                ) : (
                  <StudentPicker value={field.value} onChange={field.onChange} invalid={!!errors.studentId} />
                )
              }
            />
          </Field>
        )}
        <Field label="Type" htmlFor="type">
          <Controller control={control} name="type" render={({ field }) => <OptionSelect id="type" value={field.value} onChange={(v) => field.onChange(v ?? "SICK")} options={LEAVE_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t]! }))} />} />
        </Field>
        <FieldRow>
          <Field label="From" htmlFor="startDate" error={errors.startDate?.message} required>
            <FormDatePicker control={control} name="startDate" />
          </Field>
          <Field label="To" htmlFor="endDate" error={errors.endDate?.message} required>
            <FormDatePicker control={control} name="endDate" />
          </Field>
        </FieldRow>
        <Field label="Reason" htmlFor="reason" error={errors.reason?.message} required>
          <Textarea rows={3} placeholder="e.g. Fever — doctor advised two days' rest" {...register("reason")} />
        </Field>
      </form>
    </FormDrawer>
  );
}

const TABS = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "", label: "All" },
];

export function LeaveView({ rows, total, pending, page, pageSize, subjects, canRequest, canReview }: { rows: Row[]; total: number; pending: number; page: number; pageSize: number; subjects: Subjects; canRequest: boolean; canReview: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { set } = useUrlState();
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestKey, setRequestKey] = useState(0);
  const [review, setReview] = useState<{ row: Row; decision: "APPROVED" | "REJECTED" } | null>(null);
  const [note, setNote] = useState("");
  const status = searchParams.get("status") ?? "";
  const canFile = canRequest && (!!subjects.self || subjects.children.length > 0 || subjects.canFileForOthers);

  const act = async (fn: () => Promise<{ message: string }>) => {
    try {
      toast.success((await fn()).message);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  return (
    <div>
      <PageHeader
        title="Leave"
        description={canReview ? "Review leave requests from staff, students and parents." : "Request leave and follow its status."}
        actions={
          canFile && (
            <Button
              onClick={() => {
                setRequestKey((k) => k + 1);
                setRequestOpen(true);
              }}
            >
              <Plus /> Request leave
            </Button>
          )
        }
      />
      <div role="tablist" aria-label="Status" className="no-scrollbar mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={status === t.key}
            onClick={() => set({ status: t.key || null })}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-small font-medium whitespace-nowrap",
              status === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.key === "PENDING" && pending > 0 && <Badge variant="warning" className="ms-1.5">{pending}</Badge>}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Plane}
          title={status === "PENDING" ? "Nothing waiting for review" : "No leave requests"}
          description={canFile ? "Requests you submit will show here with their status." : "Leave requests will appear here."}
          actions={canFile && <Button variant="outline" onClick={() => setRequestOpen(true)}><Plus /> Request leave</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const s = STATUS_BADGE[r.status];
            return (
              <li key={r.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs sm:flex-row sm:items-start">
                <PersonAvatar name={r.person} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{r.person}</p>
                    <Badge variant={r.requesterType === "STAFF" ? "primary" : "secondary"}>{r.requesterType === "STAFF" ? "Staff" : "Student"}</Badge>
                    <Badge variant={s.variant} dot>
                      {s.label}
                    </Badge>
                  </div>
                  <p className="text-small text-muted-foreground">{r.detail}</p>
                  <p className="mt-2 text-small">
                    <span className="font-medium">{TYPE_LABELS[r.type]} leave</span> · {formatDate(r.startDate, "dayMonth")}
                    {r.endDate !== r.startDate && ` – ${formatDate(r.endDate, "dayMonth")}`} · {r.days} {r.days === 1 ? "day" : "days"}
                  </p>
                  <p className="mt-1 text-small text-muted-foreground">“{r.reason}”</p>
                  <p className="mt-2 text-caption text-subtle-foreground">
                    Requested by {r.requestedBy}
                    {r.reviewedBy && ` · ${r.status.toLowerCase()} by ${r.reviewedBy}`}
                    {r.reviewNote && ` — “${r.reviewNote}”`}
                  </p>
                </div>
                <div className="flex gap-2 sm:flex-col">
                  {r.canReview && (
                    <>
                      <Button size="sm" onClick={() => setReview({ row: r, decision: "APPROVED" })}>
                        <Check /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setReview({ row: r, decision: "REJECTED" })}>
                        <X /> Reject
                      </Button>
                    </>
                  )}
                  {r.canCancel && (
                    <Button size="sm" variant="ghost" onClick={() => act(() => api.delete(`/api/leave/${r.id}`)).catch(() => undefined)}>
                      Cancel request
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} noun="requests" />

      <RequestDrawer key={requestKey} open={requestOpen} onOpenChange={setRequestOpen} subjects={subjects} />
      <ConfirmDialog
        open={!!review}
        onOpenChange={(o) => {
          if (!o) {
            setReview(null);
            setNote("");
          }
        }}
        tone={review?.decision === "REJECTED" ? "danger" : "default"}
        title={`${review?.decision === "APPROVED" ? "Approve" : "Reject"} leave for ${review?.row.person ?? ""}?`}
        description={review?.decision === "APPROVED" ? "Any absences already recorded in these dates become excused leave. The requester is notified." : "The requester is notified with your note."}
        confirmLabel={review?.decision === "APPROVED" ? "Approve leave" : "Reject leave"}
        onConfirm={async () => {
          if (review) await act(() => api.post(`/api/leave/${review.row.id}`, { decision: review.decision, note }));
          setNote("");
        }}
      >
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional note to the requester" aria-label="Note" />
      </ConfirmDialog>
    </div>
  );
}
