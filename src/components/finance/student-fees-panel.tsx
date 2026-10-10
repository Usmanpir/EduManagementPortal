"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/common/empty-state";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { StatCard } from "@/components/common/stat-card";
import { ProfileCard } from "@/components/people/info-list";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import { CATEGORY_LABELS, FREQUENCY_LABELS, InvoiceStatusBadge } from "./finance-ui";
import { PaymentDrawer } from "./payment-drawer";

type PlanItem = {
  feeStructureId: string;
  name: string;
  category: string;
  frequency: string;
  amount: number;
  optIn: boolean;
  applies: boolean;
  discountType: string;
  discountValue: number;
  discountReason: string | null;
};
type InvoiceRow = { id: string; invoiceNo: string; title: string; dueDate: string; total: number; paid: number; balance: number; status: string };

export type StudentFeesData = { plan: PlanItem[] | null; invoices: InvoiceRow[] | null; currency: string; today: string; canManage: boolean; canRecord: boolean };

const net = (f: PlanItem) => (f.discountType === "PERCENT" ? f.amount * (1 - f.discountValue / 100) : f.discountType === "FIXED" ? f.amount - f.discountValue : f.amount);

function DiscountDrawer({ studentId, fee, currency, onOpenChange }: { studentId: string; fee: PlanItem; currency: string; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [type, setType] = useState(fee.discountType);
  const [value, setValue] = useState(String(fee.discountValue || ""));
  const [reason, setReason] = useState(fee.discountReason ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setError(null);
    try {
      const { message } = await api.put(`/api/students/${studentId}/fees`, { feeStructureId: fee.feeStructureId, isActive: fee.applies, discountType: type, discountValue: type === "NONE" ? 0 : value || 0, discountReason: reason });
      toast.success(message);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDrawer open onOpenChange={onOpenChange} title={`Discount · ${fee.name}`} description={`Standard amount ${formatMoney(fee.amount, currency)}. Applies to invoices generated from now on.`} formId="discount-form" submitting={saving}>
      <form id="discount-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormAlert>{error}</FormAlert>
        <FieldRow>
          <Field label="Discount" htmlFor="discountType">
            <OptionSelect
              id="discountType"
              value={type}
              onChange={(v) => setType(v ?? "NONE")}
              options={[
                { value: "NONE", label: "No discount" },
                { value: "PERCENT", label: "Percentage" },
                { value: "FIXED", label: `Fixed amount (${currency})` },
              ]}
            />
          </Field>
          {type !== "NONE" && (
            <Field label={type === "PERCENT" ? "Percent" : "Amount"} htmlFor="discountValue" error={errors.discountValue} required>
              <Input id="discountValue" type="number" inputMode="decimal" min={0} max={type === "PERCENT" ? 100 : fee.amount} value={value} onChange={(e) => setValue(e.target.value)} className="tabular" />
            </Field>
          )}
        </FieldRow>
        {type !== "NONE" && (
          <Field label="Reason" htmlFor="discountReason" error={errors.discountReason} hint="e.g. Sibling discount, staff child, merit scholarship">
            <Input id="discountReason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
      </form>
    </FormDrawer>
  );
}

export function StudentFeesPanel({ studentId, studentName, plan, invoices, currency, today, canManage, canRecord }: StudentFeesData & { studentId: string; studentName: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [paying, setPaying] = useState<{ invoice: InvoiceRow; key: number } | null>(null);
  const money = (v: number) => formatMoney(v, currency);
  const open = (invoices ?? []).filter((i) => ["PENDING", "PARTIAL", "OVERDUE"].includes(i.status));
  const outstanding = open.reduce((n, i) => n + i.balance, 0);
  const monthly = (plan ?? []).filter((f) => f.applies && f.frequency === "MONTHLY").reduce((n, f) => n + net(f), 0);

  const toggle = async (f: PlanItem, applies: boolean) => {
    try {
      const { message } = await api.put(`/api/students/${studentId}/fees`, { feeStructureId: f.feeStructureId, isActive: applies, discountType: f.discountType, discountValue: f.discountValue, discountReason: f.discountReason });
      toast.success(message);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {invoices && <StatCard label="Outstanding" value={money(outstanding)} hint={`${open.length} unpaid invoice${open.length === 1 ? "" : "s"}`} tone={outstanding > 0 ? "warning" : "success"} />}
        {plan && <StatCard label="Monthly fee" value={money(monthly)} hint="After discounts" tone="primary" />}
      </div>

      {plan && (
        <ProfileCard title="Fee plan">
          {plan.length === 0 ? (
            <p className="text-small text-muted-foreground">
              No fees apply to this student&apos;s class yet.{" "}
              <Link href="/finance/fees" className="font-medium text-primary hover:underline">
                Set up fees
              </Link>
            </p>
          ) : (
            <ul className="-mx-1 divide-y">
              {plan.map((f) => (
                <li key={f.feeStructureId} className="flex flex-wrap items-center gap-3 px-1 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {f.name}
                      {f.optIn && (
                        <Badge variant="secondary" className="ms-2">
                          Opt-in
                        </Badge>
                      )}
                    </p>
                    <p className="text-caption text-muted-foreground">
                      {CATEGORY_LABELS[f.category]} · {FREQUENCY_LABELS[f.frequency]}
                      {f.discountType !== "NONE" && (
                        <span className="text-success-foreground">
                          {" "}
                          · {f.discountType === "PERCENT" ? `${f.discountValue}%` : money(f.discountValue)} off{f.discountReason ? ` (${f.discountReason})` : ""}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-end">
                    {f.discountType !== "NONE" && <p className="tabular text-caption text-muted-foreground line-through">{money(f.amount)}</p>}
                    <p className={f.applies ? "tabular font-semibold" : "tabular text-muted-foreground"}>{money(net(f))}</p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit discount for ${f.name}`} onClick={() => setEditing(f)} disabled={!f.applies}>
                        <Pencil />
                      </Button>
                      <Switch checked={f.applies} onCheckedChange={(v) => toggle(f, v)} aria-label={`${f.name} applies to ${studentName}`} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ProfileCard>
      )}

      {invoices && (
        <ProfileCard title="Invoices">
          {invoices.length === 0 ? (
            <EmptyState icon={Receipt} title="No invoices yet" description="Invoices for this student will appear here once billed." className="border-0 py-6" />
          ) : (
            <ul className="-mx-1 divide-y">
              {invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-1 py-2.5">
                  <Link href={`/finance/invoices/${i.id}`} className="min-w-0 flex-1 hover:underline">
                    <p className="font-medium">{i.title}</p>
                    <p className="text-caption text-muted-foreground">
                      {i.invoiceNo} · due {formatDate(i.dueDate)}
                    </p>
                  </Link>
                  <div className="text-end">
                    <p className="tabular font-semibold">{money(i.balance > 0 ? i.balance : i.total)}</p>
                    <InvoiceStatusBadge status={i.status} />
                  </div>
                  {canRecord && i.balance > 0 && i.status !== "CANCELLED" && (
                    <Button size="sm" variant="outline" onClick={() => setPaying((p) => ({ invoice: i, key: (p?.key ?? 0) + 1 }))}>
                      <Plus /> Pay
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ProfileCard>
      )}

      {editing && <DiscountDrawer studentId={studentId} fee={editing} currency={currency} onOpenChange={(o) => !o && setEditing(null)} />}
      {paying && (
        <PaymentDrawer
          key={paying.key}
          open
          onOpenChange={(o) => !o && setPaying(null)}
          currency={currency}
          today={today}
          invoice={{ ...paying.invoice, student: studentName }}
        />
      )}
    </div>
  );
}
