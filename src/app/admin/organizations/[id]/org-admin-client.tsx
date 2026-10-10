"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Plus, RotateCcw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { OptionSelect } from "@/components/common/option-select";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { addDays, formatDate, formatMoney } from "@/lib/format";
import type { organizationDetail } from "@/server/modules/platform/billing";
import { DatePicker } from "@/components/common/date-pickers";

type Detail = Awaited<ReturnType<typeof organizationDetail>>;
type Sub = NonNullable<Detail["subscription"]>;

const LIMITS: [string, string][] = [
  ["students", "Students"],
  ["teachers", "Teachers"],
  ["staff", "Staff"],
  ["campuses", "Campuses"],
  ["storageMb", "Storage (MB)"],
  ["notificationsPerMonth", "Messages / month"],
];
const today = () => new Date().toISOString().slice(0, 10);

function useAct() {
  const router = useRouter();
  return async (fn: () => Promise<{ message: string }>) => {
    try {
      toast.success((await fn()).message);
      router.refresh();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };
}

export function OrgStatusControl({ orgId, status }: { orgId: string; status: string }) {
  const act = useAct();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const suspend = status !== "SUSPENDED";
  return (
    <>
      <Button variant={suspend ? "destructive-subtle" : "outline"} onClick={() => setOpen(true)}>
        {suspend ? <Ban /> : <RotateCcw />} {suspend ? "Suspend organization" : "Reactivate"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone={suspend ? "danger" : "default"}
        title={suspend ? "Suspend this organization?" : "Reactivate this organization?"}
        description={suspend ? "Everyone in it keeps read-only access; nobody can make changes. Use for abuse or legal holds — use the subscription status for billing." : "Users can make changes again."}
        confirmLabel={suspend ? "Suspend" : "Reactivate"}
        onConfirm={async () => {
          if (await act(() => api.post(`/api/admin/organizations/${orgId}/status`, { status: suspend ? "SUSPENDED" : "ACTIVE", reason }))) setOpen(false);
        }}
      >
        <Field label="Reason" htmlFor="org-reason" required>
          <Textarea id="org-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </ConfirmDialog>
    </>
  );
}

export function SubscriptionForm({ orgId, sub, plans }: { orgId: string; sub: Sub; plans: Detail["plans"] }) {
  const router = useRouter();
  const [v, setV] = useState({
    planId: sub.planId,
    status: sub.status,
    billingCycle: sub.billingCycle,
    trialEndsAt: sub.trialEndsAt ?? "",
    currentPeriodEnd: sub.currentPeriodEnd,
    customPrice: sub.customPrice === null ? "" : String(sub.customPrice),
    customLimits: Object.fromEntries(LIMITS.map(([k]) => [k, sub.customLimits && k in sub.customLimits ? (sub.customLimits[k as keyof typeof sub.customLimits] === null ? "unlimited" : String(sub.customLimits[k as keyof typeof sub.customLimits])) : ""])) as Record<string, string>,
    reason: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const plan = plans.find((p) => p.id === v.planId);
  const patch = (p: Partial<typeof v>) => setV((prev) => ({ ...prev, ...p }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const customLimits = Object.fromEntries(
      Object.entries(v.customLimits)
        .filter(([, x]) => x.trim() !== "")
        .map(([k, x]) => [k, x.trim().toLowerCase() === "unlimited" ? null : Number(x)]),
    );
    try {
      await api.put(`/api/admin/organizations/${orgId}/subscription`, { ...v, customLimits: Object.keys(customLimits).length ? customLimits : null });
      toast.success("Subscription updated.");
      patch({ reason: "" });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs">
      <h2 className="text-h3">Subscription</h2>
      <FieldRow>
        <Field label="Plan" htmlFor="planId">
          <OptionSelect id="planId" value={v.planId} onChange={(x) => x && patch({ planId: x })} options={plans.map((p) => ({ value: p.id, label: `${p.name}${p.isPublic ? "" : " (private)"}` }))} />
        </Field>
        <Field label="Status" htmlFor="status">
          <OptionSelect
            id="status"
            value={v.status}
            onChange={(x) => x && patch({ status: x })}
            options={[
              { value: "TRIALING", label: "Trial" },
              { value: "ACTIVE", label: "Active" },
              { value: "PAST_DUE", label: "Past due (grace)" },
              { value: "SUSPENDED", label: "Suspended (read-only)" },
              { value: "CANCELED", label: "Canceled" },
            ]}
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Billing cycle" htmlFor="cycle">
          <OptionSelect id="cycle" value={v.billingCycle} onChange={(x) => x && patch({ billingCycle: x })} options={[{ value: "MONTHLY", label: "Monthly" }, { value: "YEARLY", label: "Yearly" }, { value: "CUSTOM", label: "Custom" }]} />
        </Field>
        <Field label={`Custom price (${plan?.currency ?? "PKR"})`} htmlFor="price" error={errors.customPrice} hint={plan ? `List: ${formatMoney(v.billingCycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly, plan.currency)}` : undefined}>
          <Input id="price" type="number" min={0} className="tabular" value={v.customPrice} onChange={(e) => patch({ customPrice: e.target.value })} placeholder="List price" />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Trial ends" htmlFor="trial" error={errors.trialEndsAt}>
          <DatePicker id="trial" value={v.trialEndsAt} onChange={(date) => patch({ trialEndsAt: date })} />
        </Field>
        <Field label="Current period ends" htmlFor="period" error={errors.currentPeriodEnd}>
          <DatePicker id="period" value={v.currentPeriodEnd} onChange={(date) => patch({ currentPeriodEnd: date })} />
        </Field>
      </FieldRow>
      <fieldset>
        <legend className="mb-1 text-small font-medium">Custom limits</legend>
        <p className="mb-2 text-caption text-muted-foreground">Leave blank to follow the plan. Type “unlimited” for no limit.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LIMITS.map(([k, label]) => {
            const planValue = plan?.limits[k as keyof typeof plan.limits];
            return (
              <Field key={k} label={label} htmlFor={`lim-${k}`} error={errors[`customLimits.${k}`]}>
                <Input id={`lim-${k}`} className="tabular" value={v.customLimits[k] ?? ""} placeholder={planValue === null || planValue === undefined ? "Unlimited" : String(planValue)} onChange={(e) => setV((prev) => ({ ...prev, customLimits: { ...prev.customLimits, [k]: e.target.value } }))} />
              </Field>
            );
          })}
        </div>
      </fieldset>
      <Field label="Reason for change" htmlFor="sub-reason" error={errors.reason} required>
        <Input id="sub-reason" value={v.reason} onChange={(e) => patch({ reason: e.target.value })} placeholder="e.g. Upgrade agreed on call, ticket #12" />
      </Field>
      <div>
        <Button type="submit" loading={saving}>
          Save subscription
        </Button>
      </div>
    </form>
  );
}

type Invoice = Detail["invoices"][number];

export function InvoicesPanel({ orgId, invoices, currency, suggested }: { orgId: string; invoices: Invoice[]; currency: string; suggested: { amount: number; cycle: string } | null }) {
  const act = useAct();
  const router = useRouter();
  const start = today();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ amount: suggested ? String(suggested.amount) : "", periodStart: start, periodEnd: addDays(start, suggested?.cycle === "YEARLY" ? 365 : 30), dueAt: addDays(start, 10) });
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [note, setNote] = useState("");
  const [paidAt, setPaidAt] = useState(start);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between">
        <h2 className="text-h3">Invoices</h2>
        <Button size="sm" variant="outline" onClick={() => setCreating((c) => !c)}>
          <Plus /> New invoice
        </Button>
      </div>
      {creating && (
        <form
          className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              const { message } = await api.post(`/api/admin/organizations/${orgId}/invoices`, form);
              toast.success(message);
              setCreating(false);
              router.refresh();
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <FormAlert>{error}</FormAlert>
          <FieldRow>
            <Field label={`Amount (${currency})`} htmlFor="inv-amount" required>
              <Input id="inv-amount" type="number" min={1} className="tabular" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Due" htmlFor="inv-due">
              <DatePicker id="inv-due" value={form.dueAt} onChange={(date) => setForm({ ...form, dueAt: date })} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Period from" htmlFor="inv-from">
              <DatePicker id="inv-from" value={form.periodStart} onChange={(date) => setForm({ ...form, periodStart: date })} />
            </Field>
            <Field label="Period to" htmlFor="inv-to">
              <DatePicker id="inv-to" value={form.periodEnd} onChange={(date) => setForm({ ...form, periodEnd: date })} />
            </Field>
          </FieldRow>
          <div>
            <Button type="submit" size="sm">
              Issue invoice
            </Button>
          </div>
        </form>
      )}
      {invoices.length === 0 ? (
        <p className="text-small text-muted-foreground">No invoices yet.</p>
      ) : (
        <ul className="divide-y">
          {invoices.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 py-2.5 text-small">
              <div className="min-w-0 flex-1">
                <p className="font-medium tabular">{i.number}</p>
                <p className="text-caption text-muted-foreground">
                  {formatDate(i.periodStart)} – {formatDate(i.periodEnd)} · due {formatDate(i.dueAt)}
                  {i.paymentNote ? ` · ${i.paymentNote}` : ""}
                </p>
              </div>
              <span className="tabular font-semibold">{formatMoney(i.amount, i.currency)}</span>
              <Badge variant={i.status === "PAID" ? "success" : i.status === "VOID" ? "neutral" : "warning"}>{i.status === "PAID" ? `Paid ${formatDate(i.paidAt)}` : i.status === "VOID" ? "Void" : "Open"}</Badge>
              {i.status === "OPEN" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setPaying(i)}>
                    <CheckCircle2 /> Mark paid
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Void ${i.number}`} onClick={() => setVoiding(i)}>
                    <Undo2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!paying}
        onOpenChange={(o) => !o && setPaying(null)}
        title={`Record payment for ${paying?.number}?`}
        description="Only do this once the money is in the bank. The subscription becomes active for the invoice period."
        confirmLabel="Record payment"
        onConfirm={async () => {
          if (await act(() => api.post(`/api/admin/invoices/${paying!.id}`, { action: "paid", paidAt, note }))) {
            setPaying(null);
            setNote("");
          }
        }}
      >
        <FieldRow>
          <Field label="Received on" htmlFor="paid-at">
            <DatePicker id="paid-at" value={paidAt} onChange={(date) => setPaidAt(date)} />
          </Field>
          <Field label="Reference" htmlFor="paid-note" required>
            <Input id="paid-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bank ref / cheque no." />
          </Field>
        </FieldRow>
      </ConfirmDialog>
      <ConfirmDialog
        open={!!voiding}
        onOpenChange={(o) => !o && setVoiding(null)}
        tone="danger"
        title={`Void ${voiding?.number}?`}
        description="The school won't owe this amount."
        confirmLabel="Void invoice"
        onConfirm={async () => {
          if (await act(() => api.post(`/api/admin/invoices/${voiding!.id}`, { action: "void", reason: note || "Issued in error" }))) {
            setVoiding(null);
            setNote("");
          }
        }}
      >
        <Field label="Reason" htmlFor="void-note">
          <Input id="void-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Issued in error" />
        </Field>
      </ConfirmDialog>
    </section>
  );
}
