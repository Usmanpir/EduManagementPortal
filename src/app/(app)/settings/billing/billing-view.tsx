"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, LifeBuoy, Printer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { SettingsCard } from "@/components/common/settings-card";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { billingOverview } from "@/server/modules/billing/account";

type Data = Awaited<ReturnType<typeof billingOverview>>;
type Plan = Data["plans"][number];

const STATUS: Record<string, { label: string; variant: "success" | "info" | "warning" | "danger" | "neutral" }> = {
  ACTIVE: { label: "Active", variant: "success" },
  TRIALING: { label: "Free trial", variant: "info" },
  PAST_DUE: { label: "Payment due", variant: "warning" },
  SUSPENDED: { label: "Suspended — read-only", variant: "danger" },
  CANCELED: { label: "Canceled", variant: "neutral" },
};
const LIMIT_LABELS: [keyof Plan["limits"], string][] = [
  ["students", "students"],
  ["teachers", "teachers"],
  ["campuses", "campuses"],
  ["storageMb", "storage"],
  ["notificationsPerMonth", "messages / month"],
];
const fmtLimit = (k: string, v: number | null) => (v === null ? "Unlimited" : k === "storageMb" ? (v >= 1024 ? `${Math.round(v / 1024)} GB` : `${v} MB`) : formatNumber(v));

export function BillingView({ data, canManage }: { data: Data; canManage: boolean }) {
  const router = useRouter();
  const s = data.subscription;
  const [cycle, setCycle] = useState<"MONTHLY" | "YEARLY">(s?.billingCycle === "YEARLY" ? "YEARLY" : "MONTHLY");
  const [requesting, setRequesting] = useState<Plan | null>(null);
  const [note, setNote] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const currency = s?.currency ?? data.plans[0]?.currency ?? "PKR";

  const act = async (fn: () => Promise<{ message: string }>) => {
    try {
      toast.success((await fn()).message);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {s && (
        <SettingsCard title="Your plan">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex flex-wrap items-center gap-2 text-h2">
                {s.planName}
                <Badge variant={STATUS[s.status]?.variant ?? "neutral"} dot>
                  {STATUS[s.status]?.label ?? s.status}
                </Badge>
                {s.custom && <Badge variant="secondary">Custom terms</Badge>}
              </p>
              <p className="mt-1 text-small text-muted-foreground">
                {s.status === "TRIALING" && s.trialDaysLeft !== null
                  ? `${s.trialDaysLeft} day${s.trialDaysLeft === 1 ? "" : "s"} left in your free trial (ends ${formatDate(s.trialEndsAt, "long")}).`
                  : `${formatMoney(s.price, s.currency)} / ${s.billingCycle === "YEARLY" ? "year" : "month"} · ${s.cancelAtPeriodEnd ? "ends" : "renews"} ${formatDate(s.currentPeriodEnd, "long")}`}
              </p>
            </div>
            {canManage && s.status === "ACTIVE" && (
              <Button variant="ghost" size="sm" onClick={() => (s.cancelAtPeriodEnd ? act(() => api.post("/api/billing/cancel", { cancel: false })) : setCancelling(true))}>
                {s.cancelAtPeriodEnd ? "Keep my subscription" : "Cancel subscription"}
              </Button>
            )}
          </div>
          {s.status === "PAST_DUE" && <FormAlert variant="info">A payment is due. Pay any open invoice below to keep everything running; after the grace period your account becomes read-only.</FormAlert>}
          {s.status === "SUSPENDED" && <FormAlert>EduAttend is read-only until billing is settled. Your data is safe. Pay an open invoice or request a plan below.</FormAlert>}
          {s.cancelAtPeriodEnd && <FormAlert variant="info">Your subscription ends on {formatDate(s.currentPeriodEnd, "long")}. After that your data stays available read-only.</FormAlert>}
        </SettingsCard>
      )}

      <SettingsCard title="Usage" description="What you're using against your plan's limits.">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data.usage.map((u) => {
            const pct = u.limit ? Math.min(100, (u.used / u.limit) * 100) : 0;
            const near = u.limit !== null && pct >= 90;
            return (
              <li key={u.key}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-small">
                  <span className="font-medium">{u.label}</span>
                  <span className={cn("tabular", near ? "font-semibold text-danger-foreground" : "text-muted-foreground")}>
                    {formatNumber(u.used)}
                    {u.unit ? ` ${u.unit}` : ""} / {u.limit === null ? "unlimited" : `${formatNumber(u.limit)}${u.unit ? ` ${u.unit}` : ""}`}
                  </span>
                </div>
                <Progress value={u.limit === null ? 0 : pct} aria-label={`${u.label} usage`} className={cn(near && "[&>div]:bg-danger")} />
              </li>
            );
          })}
        </ul>
      </SettingsCard>

      <SettingsCard
        title="Plans"
        description="Choose a plan and we'll confirm the details and send an invoice. Payment is by bank transfer — no card needed."
        footer={
          data.openRequest ? (
            <p className="text-small">
              Your request{" "}
              <Link href={`/support/${data.openRequest.id}`} className="font-medium text-primary hover:underline">
                #{data.openRequest.number} · {data.openRequest.subject}
              </Link>{" "}
              is with our team.
            </p>
          ) : undefined
        }
      >
        <div role="radiogroup" aria-label="Billing cycle" className="mb-4 inline-flex gap-1 rounded-lg bg-muted p-1">
          {(["MONTHLY", "YEARLY"] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={cycle === c} onClick={() => setCycle(c)} className={cn("rounded-md px-3 py-1 text-small font-medium", cycle === c ? "bg-card shadow-xs" : "text-muted-foreground")}>
              {c === "MONTHLY" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {data.plans.map((p) => {
            const current = s?.planId === p.id;
            const price = cycle === "YEARLY" ? p.priceYearly : p.priceMonthly;
            return (
              <li key={p.id} className={cn("flex flex-col rounded-xl border p-4", p.highlighted && "border-primary ring-1 ring-primary", current && "bg-primary-subtle/30")}>
                <div className="mb-1 flex items-center gap-2">
                  <p className="font-semibold">{p.name}</p>
                  {p.highlighted && <Badge variant="primary">Most popular</Badge>}
                  {current && <Badge variant="success">Current</Badge>}
                </div>
                <p className="mb-3 text-caption text-muted-foreground">{p.description}</p>
                <p className="mb-3">
                  {p.isCustom ? (
                    <span className="text-h3">Custom pricing</span>
                  ) : (
                    <>
                      <span className="tabular text-h2">{formatMoney(price, p.currency)}</span>
                      <span className="text-small text-muted-foreground"> / {cycle === "YEARLY" ? "year" : "month"}</span>
                      {cycle === "YEARLY" && p.priceMonthly * 12 > p.priceYearly && <span className="block text-caption text-success-foreground">Save {formatMoney(p.priceMonthly * 12 - p.priceYearly, p.currency)} a year</span>}
                    </>
                  )}
                </p>
                <ul className="mb-4 flex flex-col gap-1 text-small">
                  {LIMIT_LABELS.map(([k, label]) => (
                    <li key={k} className="flex items-center gap-2">
                      <Check className="size-4 text-success" aria-hidden /> {fmtLimit(k, p.limits[k])} {label}
                    </li>
                  ))}
                  {p.features.slice(0, 4).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-muted-foreground">
                      <Check className="size-4" aria-hidden /> {f}
                    </li>
                  ))}
                </ul>
                {canManage && (
                  <Button className="mt-auto" variant={p.highlighted ? "default" : "outline"} disabled={!!data.openRequest || (current && s?.billingCycle === cycle && s.status === "ACTIVE")} onClick={() => setRequesting(p)}>
                    {current ? (s?.status === "ACTIVE" ? (s.billingCycle === cycle ? "Your plan" : `Switch to ${cycle.toLowerCase()}`) : "Activate this plan") : p.isCustom ? "Talk to us" : "Request this plan"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </SettingsCard>

      <SettingsCard title="Invoices" description={data.paymentInstructions ? undefined : "Invoices from EduAttend appear here."}>
        {data.paymentInstructions && (
          <div className="mb-4 rounded-lg border border-dashed p-3 text-small">
            <p className="font-medium">How to pay</p>
            <p className="text-muted-foreground">{data.paymentInstructions}</p>
            {data.contactEmail && <p className="mt-1 text-muted-foreground">Send the transfer receipt to {data.contactEmail} and we&apos;ll mark it paid.</p>}
          </div>
        )}
        {data.invoices.length === 0 ? (
          <p className="text-small text-muted-foreground">No invoices yet.</p>
        ) : (
          <ul className="-mx-1 divide-y">
            {data.invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-1 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium tabular">{i.number}</p>
                  <p className="text-caption text-muted-foreground">
                    {formatDate(i.periodStart)} – {formatDate(i.periodEnd)} · due {formatDate(i.dueAt)}
                    {i.paidAt ? ` · paid ${formatDate(i.paidAt)}` : ""}
                  </p>
                </div>
                <span className="tabular font-semibold">{formatMoney(i.amount, i.currency)}</span>
                <Badge variant={i.status === "PAID" ? "success" : i.status === "VOID" ? "neutral" : i.overdue ? "danger" : "warning"} dot>
                  {i.status === "PAID" ? "Paid" : i.status === "VOID" ? "Void" : i.overdue ? "Overdue" : "Open"}
                </Badge>
                <Button variant="ghost" size="icon-sm" asChild>
                  <a href={`/settings/billing/invoice/${i.id}`} target="_blank" rel="noreferrer" aria-label={`Print ${i.number}`}>
                    <Printer />
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <p className="flex items-center gap-2 text-small text-muted-foreground">
        <LifeBuoy className="size-4" /> Questions about billing?{" "}
        <Link href="/support?new=1&category=billing" className="font-medium text-primary hover:underline">
          Contact support
        </Link>
      </p>

      <ConfirmDialog
        open={!!requesting}
        onOpenChange={(o) => !o && setRequesting(null)}
        title={requesting?.isCustom ? `Talk to us about ${requesting.name}` : `Request the ${requesting?.name} plan?`}
        description={
          requesting && !requesting.isCustom
            ? `${formatMoney(cycle === "YEARLY" ? requesting.priceYearly : requesting.priceMonthly, currency)} per ${cycle === "YEARLY" ? "year" : "month"}. We'll confirm and send an invoice; your plan changes once it's paid.`
            : "Tell us about your institution and we'll prepare a quote."
        }
        confirmLabel="Send request"
        onConfirm={async () => {
          await act(() => api.post("/api/billing/request", { planKey: requesting!.key, billingCycle: cycle, note }));
          setRequesting(null);
          setNote("");
        }}
      >
        <Field label="Anything we should know?" htmlFor="req-note">
          <Textarea id="req-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. number of campuses, preferred start date" />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        tone="danger"
        title="Cancel your subscription?"
        description={s ? `It stays active until ${formatDate(s.currentPeriodEnd, "long")}, then your data becomes read-only. You can change your mind any time before then.` : ""}
        confirmLabel="Cancel at period end"
        cancelLabel="Keep subscription"
        onConfirm={async () => {
          await act(() => api.post("/api/billing/cancel", { cancel: true, reason }));
          setCancelling(false);
        }}
      >
        <Field label="Why are you leaving? (optional)" htmlFor="cancel-reason">
          <Textarea id="cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="mt-2 flex items-center gap-1.5 text-caption text-muted-foreground">
          <CircleAlert className="size-3.5" /> No refunds are issued automatically for the current period.
        </p>
      </ConfirmDialog>
    </div>
  );
}
