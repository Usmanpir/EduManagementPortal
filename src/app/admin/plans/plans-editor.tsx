"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { PageHeader } from "@/components/common/page-header";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { formatMoney, formatNumber } from "@/lib/format";
import { LIMIT_KEYS } from "@/lib/validation/billing";
import type { listPlansForAdmin } from "@/server/modules/platform/billing";

type Plan = Awaited<ReturnType<typeof listPlansForAdmin>>[number];
const LIMIT_LABELS: Record<string, string> = { students: "Students", teachers: "Teachers", staff: "Staff", campuses: "Campuses", storageMb: "Storage (MB)", notificationsPerMonth: "Messages / month", apiRequestsPerDay: "API requests / day" };

type Draft = { key: string; name: string; description: string; priceMonthly: string; priceYearly: string; currency: string; trialDays: string; limits: Record<string, string>; features: string; isPublic: boolean; isCustom: boolean; highlighted: boolean; sortOrder: string };

const toDraft = (p: Plan | null): Draft =>
  p
    ? { key: p.key, name: p.name, description: p.description, priceMonthly: String(p.priceMonthly), priceYearly: String(p.priceYearly), currency: p.currency, trialDays: String(p.trialDays), limits: Object.fromEntries(LIMIT_KEYS.map((k) => [k, p.limits[k] === null ? "" : String(p.limits[k])])), features: p.features.join("\n"), isPublic: p.isPublic, isCustom: p.isCustom, highlighted: p.highlighted, sortOrder: String(p.sortOrder) }
    : { key: "", name: "", description: "", priceMonthly: "", priceYearly: "", currency: "PKR", trialDays: "14", limits: Object.fromEntries(LIMIT_KEYS.map((k) => [k, ""])), features: "", isPublic: true, isCustom: false, highlighted: false, sortOrder: "10" };

function PlanToggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <span>
        <span className="block text-small font-medium">{label}</span>
        <span className="block text-caption text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function PlanDrawer({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const router = useRouter();
  const [d, setD] = useState(toDraft(plan));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<Draft>) => setD((prev) => ({ ...prev, ...p }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setError(null);
    const body = {
      ...d,
      limits: Object.fromEntries(LIMIT_KEYS.map((k) => [k, d.limits[k]!.trim() === "" ? null : d.limits[k]])),
      features: d.features.split("\n").map((f) => f.trim()).filter(Boolean),
    };
    try {
      const { message } = plan ? await api.put(`/api/admin/plans/${plan.id}`, body) : await api.post("/api/admin/plans", body);
      toast.success(message);
      onClose();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDrawer open onOpenChange={(o) => !o && onClose()} title={plan ? `Edit ${plan.name}` : "New plan"} description={plan?.subscribers ? `${plan.subscribers} organizations are on this plan — limit changes apply to them immediately.` : undefined} formId="plan-form" submitting={saving} size="lg">
      <form id="plan-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormAlert>{error}</FormAlert>
        <FieldRow>
          <Field label="Name" htmlFor="p-name" error={errors.name} required>
            <Input id="p-name" value={d.name} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <Field label="Key" htmlFor="p-key" error={errors.key} hint="Used in links; lowercase." required>
            <Input id="p-key" value={d.key} onChange={(e) => patch({ key: e.target.value })} disabled={!!plan} />
          </Field>
        </FieldRow>
        <Field label="Description" htmlFor="p-desc" error={errors.description} required>
          <Input id="p-desc" value={d.description} onChange={(e) => patch({ description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Monthly" htmlFor="p-m" error={errors.priceMonthly}>
            <Input id="p-m" type="number" min={0} className="tabular" value={d.priceMonthly} onChange={(e) => patch({ priceMonthly: e.target.value })} />
          </Field>
          <Field label="Yearly" htmlFor="p-y" error={errors.priceYearly}>
            <Input id="p-y" type="number" min={0} className="tabular" value={d.priceYearly} onChange={(e) => patch({ priceYearly: e.target.value })} />
          </Field>
          <Field label="Currency" htmlFor="p-c" error={errors.currency}>
            <Input id="p-c" maxLength={3} value={d.currency} onChange={(e) => patch({ currency: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Trial days" htmlFor="p-t" error={errors.trialDays}>
            <Input id="p-t" type="number" min={0} max={90} value={d.trialDays} onChange={(e) => patch({ trialDays: e.target.value })} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1 text-small font-medium">Limits</legend>
          <p className="mb-2 text-caption text-muted-foreground">Leave blank for unlimited.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LIMIT_KEYS.map((k) => (
              <Field key={k} label={LIMIT_LABELS[k]!} htmlFor={`l-${k}`} error={errors[`limits.${k}`]}>
                <Input id={`l-${k}`} type="number" min={0} className="tabular" placeholder="Unlimited" value={d.limits[k]} onChange={(e) => setD((prev) => ({ ...prev, limits: { ...prev.limits, [k]: e.target.value } }))} />
              </Field>
            ))}
          </div>
        </fieldset>
        <Field label="Features" htmlFor="p-f" hint="One per line, shown on the pricing page.">
          <Textarea id="p-f" rows={5} value={d.features} onChange={(e) => patch({ features: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <PlanToggle label="Public" hint="Shown on pricing & billing pages" checked={d.isPublic} onChange={(v) => patch({ isPublic: v })} />
          <PlanToggle label="Most popular" hint="Only one plan at a time" checked={d.highlighted} onChange={(v) => patch({ highlighted: v })} />
          <PlanToggle label="Custom pricing" hint="Shows “Talk to us”" checked={d.isCustom} onChange={(v) => patch({ isCustom: v })} />
        </div>
        <Field label="Sort order" htmlFor="p-s" error={errors.sortOrder}>
          <Input id="p-s" type="number" min={0} className="w-24" value={d.sortOrder} onChange={(e) => patch({ sortOrder: e.target.value })} />
        </Field>
      </form>
    </FormDrawer>
  );
}

export function PlansEditor({ plans }: { plans: Plan[] }) {
  const [editing, setEditing] = useState<{ plan: Plan | null; key: number } | null>(null);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Plans" description="Prices and limits here drive the pricing page, school billing pages and every limit check." actions={<Button onClick={() => setEditing({ plan: null, key: Date.now() })}><Plus /> New plan</Button>} />
      <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
        <table className="w-full text-small">
          <thead className="bg-muted/60">
            <tr className="border-b text-caption text-muted-foreground">
              {["Plan", "Monthly", "Yearly", "Students", "Campuses", "Messages", "Trial", "Schools", ""].map((h, i) => (
                <th key={i} className={`h-10 px-4 font-medium ${i && i < 8 ? "text-end" : "text-start"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <p className="flex items-center gap-2 font-medium">
                    {p.name}
                    {p.highlighted && <Badge variant="primary">Popular</Badge>}
                    {!p.isPublic && <Badge variant="neutral">Private</Badge>}
                    {p.isCustom && <Badge variant="secondary">Custom</Badge>}
                  </p>
                  <p className="font-mono text-caption text-muted-foreground">{p.key}</p>
                </td>
                <td className="px-4 py-3 text-end tabular">{formatMoney(p.priceMonthly, p.currency)}</td>
                <td className="px-4 py-3 text-end tabular">{formatMoney(p.priceYearly, p.currency)}</td>
                <td className="px-4 py-3 text-end tabular">{p.limits.students === null ? "∞" : formatNumber(p.limits.students)}</td>
                <td className="px-4 py-3 text-end tabular">{p.limits.campuses === null ? "∞" : p.limits.campuses}</td>
                <td className="px-4 py-3 text-end tabular">{p.limits.notificationsPerMonth === null ? "∞" : formatNumber(p.limits.notificationsPerMonth)}</td>
                <td className="px-4 py-3 text-end tabular">{p.trialDays}d</td>
                <td className="px-4 py-3 text-end tabular">{p.subscribers}</td>
                <td className="px-4 py-3 text-end">
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`} onClick={() => setEditing({ plan: p, key: Date.now() })}>
                    <Pencil />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <PlanDrawer key={editing.key} plan={editing.plan} onClose={() => setEditing(null)} />}
    </div>
  );
}
