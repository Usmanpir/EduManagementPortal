"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useFieldArray, useWatch } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { useApiForm } from "@/components/common/use-api-form";
import { StudentPicker } from "@/components/people/student-picker";
import { api, errorMessage } from "@/lib/api-client";
import { addDays, formatMoney } from "@/lib/format";
import { FEE_CATEGORIES, invoiceSchema } from "@/lib/validation/finance";
import { CATEGORY_LABELS, FREQUENCY_LABELS } from "./finance-ui";
import { DatePicker, FormDatePicker, MonthPicker } from "@/components/common/date-pickers";

export type FeeOption = { id: string; name: string; category: string; amount: number; frequency: string; className: string | null; isActive: boolean; optIn: boolean };

export function CreateInvoiceDrawer({ open, onOpenChange, currency, today }: { open: boolean; onOpenChange: (o: boolean) => void; currency: string; today: string }) {
  const router = useRouter();
  const { form, onSubmit, formError, submitting } = useApiForm({
    schema: invoiceSchema,
    defaultValues: { studentId: "", title: "", issueDate: today, dueDate: addDays(today, 10), notes: "", items: [{ description: "", category: "OTHER", amount: "" as unknown as number, discount: 0 }] },
    submit: async (v) => {
      const res = await api.post<{ id: string }>("/api/invoices", v);
      router.push(`/finance/invoices/${res.data.id}`);
      return res;
    },
    onSuccess: () => onOpenChange(false),
  });
  const { register, control, formState: { errors } } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" });
  const total = (items ?? []).reduce((n, i) => n + Math.max(0, (Number(i?.amount) || 0) - (Number(i?.discount) || 0)), 0);

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Create invoice" description="For one-off charges like admission, exam or lost-book fees." formId="invoice-form" submitLabel="Create invoice" submitting={submitting} size="lg">
      <form id="invoice-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormAlert>{formError}</FormAlert>
        <Field label="Student" htmlFor="studentId" error={errors.studentId?.message} required>
          <Controller control={control} name="studentId" render={({ field }) => <StudentPicker value={field.value} onChange={field.onChange} invalid={!!errors.studentId} />} />
        </Field>
        <Field label="Title" htmlFor="title" error={errors.title?.message} required>
          <Input placeholder="e.g. Annual exam fee" {...register("title")} />
        </Field>
        <FieldRow>
          <Field label="Issue date" htmlFor="issueDate" error={errors.issueDate?.message}>
            <FormDatePicker control={control} name="issueDate" />
          </Field>
          <Field label="Due date" htmlFor="dueDate" error={errors.dueDate?.message}>
            <FormDatePicker control={control} name="dueDate" />
          </Field>
        </FieldRow>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-small font-medium">Items</legend>
          {fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border bg-muted/20 p-2 sm:grid-cols-[1fr_9rem_7rem_6rem_auto]">
              <Input aria-label="Description" placeholder="Description" {...register(`items.${i}.description`)} aria-invalid={!!errors.items?.[i]?.description} className="col-span-2 sm:col-span-1" />
              <Controller control={control} name={`items.${i}.category`} render={({ field }) => <OptionSelect ariaLabel="Category" value={field.value} onChange={(v) => field.onChange(v ?? "OTHER")} options={FEE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c]! }))} />} />
              <Input aria-label="Amount" type="number" inputMode="decimal" placeholder="Amount" {...register(`items.${i}.amount`)} aria-invalid={!!errors.items?.[i]?.amount} className="tabular" />
              <Input aria-label="Discount" type="number" inputMode="decimal" placeholder="Discount" {...register(`items.${i}.discount`)} className="tabular" />
              <Button type="button" variant="ghost" size="icon" aria-label="Remove item" disabled={fields.length === 1} onClick={() => remove(i)}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" onClick={() => append({ description: "", category: "OTHER", amount: "" as unknown as number, discount: 0 })}>
              <Plus /> Add item
            </Button>
            <p className="text-small">
              Total <span className="tabular font-semibold">{formatMoney(total, currency)}</span>
            </p>
          </div>
        </fieldset>
        <Field label="Notes" htmlFor="notes">
          <Textarea rows={2} {...register("notes")} />
        </Field>
      </form>
    </FormDrawer>
  );
}

export function GenerateInvoicesDrawer({ open, onOpenChange, fees, classes, currency, today }: { open: boolean; onOpenChange: (o: boolean) => void; fees: FeeOption[]; classes: { value: string; label: string }[]; currency: string; today: string }) {
  const router = useRouter();
  const month = today.slice(0, 7);
  const active = fees.filter((f) => f.isActive);
  const [period, setPeriod] = useState(month);
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(`${month}-10` < today ? addDays(today, 10) : `${month}-10`);
  const [classId, setClassId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(active.filter((f) => f.frequency === "MONTHLY").map((f) => f.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { message } = await api.post("/api/invoices/generate", { billingPeriod: period, issueDate, dueDate, classId, feeStructureIds: [...selected] });
      toast.success(message);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Generate monthly invoices" description="Bills every active student for the selected fees. Students already billed for the month are skipped, so it's safe to run again." formId="generate-form" submitLabel="Generate invoices" submitting={busy} size="lg">
      <form id="generate-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormAlert>{error}</FormAlert>
        <FieldRow>
          <Field label="Month" htmlFor="period">
            <MonthPicker id="period" value={period} onChange={(v) => setPeriod(v)} />
          </Field>
          <Field label="Class" htmlFor="classId" hint="Leave empty to bill every class.">
            <OptionSelect id="classId" value={classId} onChange={setClassId} options={classes} noneLabel="All classes" />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Issue date" htmlFor="issue">
            <DatePicker id="issue" value={issueDate} onChange={(v) => setIssueDate(v)} />
          </Field>
          <Field label="Due date" htmlFor="due">
            <DatePicker id="due" value={dueDate} onChange={(v) => setDueDate(v)} />
          </Field>
        </FieldRow>
        <fieldset>
          <legend className="mb-2 text-small font-medium">Fees to include</legend>
          {active.length === 0 ? (
            <FormAlert variant="info">Create fee structures first under Finance → Fees.</FormAlert>
          ) : (
            <ul className="divide-y rounded-lg border">
              {active.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    id={`fee-${f.id}`}
                    checked={selected.has(f.id)}
                    onCheckedChange={(v) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (v === true) next.add(f.id);
                        else next.delete(f.id);
                        return next;
                      })
                    }
                  />
                  <label htmlFor={`fee-${f.id}`} className="min-w-0 flex-1 text-small">
                    <span className="font-medium">{f.name}</span>
                    <span className="block text-caption text-muted-foreground">
                      {f.className ?? "All classes"} · {FREQUENCY_LABELS[f.frequency]}
                      {f.optIn ? " · only students who opted in" : ""}
                    </span>
                  </label>
                  <span className="tabular text-small">{formatMoney(f.amount, currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      </form>
    </FormDrawer>
  );
}
