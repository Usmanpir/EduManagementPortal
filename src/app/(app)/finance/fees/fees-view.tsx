"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Controller, useWatch } from "react-hook-form";
import { Ellipsis, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { PageHeader } from "@/components/common/page-header";
import { useApiForm } from "@/components/common/use-api-form";
import { DataTable } from "@/components/data/data-table";
import { CATEGORY_LABELS, FREQUENCY_LABELS } from "@/components/finance/finance-ui";
import { useHotkey } from "@/components/shell/shell-context";
import { api, errorMessage } from "@/lib/api-client";
import { formatMoney, formatNumber } from "@/lib/format";
import { FEE_CATEGORIES, FEE_FREQUENCIES, OPT_IN_CATEGORIES, feeStructureSchema } from "@/lib/validation/finance";

type Fee = {
  id: string;
  name: string;
  category: string;
  amount: number;
  frequency: string;
  dueDay: number;
  classId: string | null;
  className: string | null;
  campusId: string | null;
  campusName: string | null;
  isActive: boolean;
  optIn: boolean;
  enrolled: number;
  used: boolean;
};
type Option = { value: string; label: string };
type Lookups = { campuses: Option[]; classes: (Option & { campusId: string })[] };

function FeeDrawer({ open, onOpenChange, fee, lookups, currency }: { open: boolean; onOpenChange: (o: boolean) => void; fee: Fee | null; lookups: Lookups; currency: string }) {
  const { form, onSubmit, formError, submitting } = useApiForm({
    schema: feeStructureSchema,
    defaultValues: fee
      ? { name: fee.name, category: fee.category as (typeof FEE_CATEGORIES)[number], amount: fee.amount, frequency: fee.frequency as (typeof FEE_FREQUENCIES)[number], dueDay: fee.dueDay, classId: fee.classId, campusId: fee.campusId, isActive: fee.isActive }
      : { name: "", category: "TUITION", amount: "" as unknown as number, frequency: "MONTHLY", dueDay: 10, classId: null, campusId: null, isActive: true },
    submit: (v) => (fee ? api.patch(`/api/fees/${fee.id}`, v) : api.post("/api/fees", v)),
    onSuccess: () => onOpenChange(false),
  });
  const { register, control, formState: { errors } } = form;
  const category = useWatch({ control, name: "category" });
  const campusId = useWatch({ control, name: "campusId" });
  const classes = campusId ? lookups.classes.filter((c) => c.campusId === campusId) : lookups.classes;

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={fee ? "Edit fee" : "New fee"} description="A fee that's billed to students, e.g. monthly tuition for Grade 5." formId="fee-form" submitting={submitting}>
      <form id="fee-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormAlert>{formError}</FormAlert>
        <Field label="Name" htmlFor="name" error={errors.name?.message} required>
          <Input placeholder="e.g. Tuition fee" {...register("name")} />
        </Field>
        <FieldRow>
          <Field label="Category" htmlFor="category">
            <Controller control={control} name="category" render={({ field }) => <OptionSelect id="category" value={field.value} onChange={(v) => field.onChange(v ?? "TUITION")} options={FEE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c]! }))} />} />
          </Field>
          <Field label={`Amount (${currency})`} htmlFor="amount" error={errors.amount?.message} required>
            <Input type="number" inputMode="decimal" min={0} step="0.01" className="tabular" {...register("amount")} />
          </Field>
        </FieldRow>
        {(OPT_IN_CATEGORIES as readonly string[]).includes(category) && (
          <FormAlert variant="info">Only students you opt in from their profile (Fees tab) are billed for {CATEGORY_LABELS[category]?.toLowerCase()}.</FormAlert>
        )}
        <FieldRow>
          <Field label="Billed" htmlFor="frequency">
            <Controller control={control} name="frequency" render={({ field }) => <OptionSelect id="frequency" value={field.value} onChange={(v) => field.onChange(v ?? "MONTHLY")} options={FEE_FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABELS[f]! }))} />} />
          </Field>
          <Field label="Due on day" htmlFor="dueDay" error={errors.dueDay?.message} hint="Of the billing month (1–28)">
            <Input type="number" min={1} max={28} {...register("dueDay")} />
          </Field>
        </FieldRow>
        <FieldRow>
          {lookups.campuses.length > 1 && (
            <Field label="Campus" htmlFor="campusId" error={errors.campusId?.message}>
              <Controller
                control={control}
                name="campusId"
                render={({ field }) => (
                  <OptionSelect
                    id="campusId"
                    value={field.value ?? null}
                    onChange={(v) => {
                      field.onChange(v);
                      form.setValue("classId", null);
                    }}
                    options={lookups.campuses}
                    noneLabel="All campuses"
                  />
                )}
              />
            </Field>
          )}
          <Field label="Class" htmlFor="classId" error={errors.classId?.message}>
            <Controller control={control} name="classId" render={({ field }) => <OptionSelect id="classId" value={field.value ?? null} onChange={field.onChange} options={classes} noneLabel="All classes" />} />
          </Field>
        </FieldRow>
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span>
                <span className="block text-small font-medium">Active</span>
                <span className="block text-caption text-muted-foreground">Inactive fees aren&apos;t included when generating invoices.</span>
              </span>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </label>
          )}
        />
      </form>
    </FormDrawer>
  );
}

export function FeesView({ fees, lookups, currency, canManage }: { fees: Fee[]; lookups: Lookups; currency: string; canManage: boolean }) {
  const router = useRouter();
  const [drawer, setDrawer] = useState<{ open: boolean; fee: Fee | null; key: number }>({ open: false, fee: null, key: 0 });
  const [removing, setRemoving] = useState<Fee | null>(null);
  const open = (fee: Fee | null) => setDrawer((d) => ({ open: true, fee, key: d.key + 1 }));
  useHotkey("n", () => open(null), canManage);
  const showCampus = lookups.campuses.length > 1;

  const columns = useMemo<ColumnDef<Fee>[]>(
    () => [
      {
        id: "name",
        header: "Fee",
        meta: { alwaysVisible: true },
        cell: ({ row: { original: f } }) => (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{f.name}</span>
            {!f.isActive && <Badge variant="neutral">Inactive</Badge>}
            {f.optIn && <Badge variant="secondary">Opt-in</Badge>}
          </div>
        ),
      },
      { id: "category", header: "Category", meta: { label: "Category" }, cell: ({ row }) => CATEGORY_LABELS[row.original.category] },
      {
        id: "applies",
        header: "Applies to",
        meta: { label: "Applies to" },
        cell: ({ row: { original: f } }) => (
          <span className="text-muted-foreground">
            {f.className ?? "All classes"}
            {showCampus && ` · ${f.campusName ?? "All campuses"}`}
          </span>
        ),
      },
      { id: "frequency", header: "Billed", meta: { label: "Billed" }, cell: ({ row }) => `${FREQUENCY_LABELS[row.original.frequency]} · day ${row.original.dueDay}` },
      { id: "enrolled", header: "Custom plans", meta: { label: "Custom plans", align: "end" }, cell: ({ row }) => <span className="tabular text-muted-foreground">{formatNumber(row.original.enrolled)}</span> },
      { id: "amount", header: "Amount", meta: { align: "end", alwaysVisible: true }, cell: ({ row }) => <span className="tabular font-semibold">{formatMoney(row.original.amount, currency)}</span> },
      ...(canManage
        ? [
            {
              id: "actions",
              header: () => <span className="sr-only">Actions</span>,
              meta: { align: "end", alwaysVisible: true },
              cell: ({ row: { original: f } }: { row: { original: Fee } }) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${f.name}`} onClick={(e) => e.stopPropagation()}>
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => open(f)}>
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(f)}>
                      <Trash2 /> {f.used ? "Switch off" : "Delete"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            } satisfies ColumnDef<Fee>,
          ]
        : []),
    ],
    [canManage, currency, showCampus],
  );

  return (
    <div>
      <PageHeader
        title="Fees"
        description="What you charge, to whom and how often. Per-student discounts and transport/hostel opt-ins live on each student's Fees tab."
        actions={
          canManage && (
            <Button onClick={() => open(null)}>
              <Plus /> New fee
            </Button>
          )
        }
      />
      {fees.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No fees set up"
          description="Add your tuition and other fees. You'll use them to generate invoices each month."
          actions={canManage && <Button onClick={() => open(null)}><Plus /> New fee</Button>}
        />
      ) : (
        <DataTable
          tableId="fees"
          columns={columns}
          data={fees}
          getRowId={(f) => f.id}
          caption="Fee structures"
          mobileCard={(f) => (
            <button type="button" className="flex w-full items-start gap-3 text-start" onClick={() => canManage && open(f)}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {f.name} {!f.isActive && <Badge variant="neutral">Inactive</Badge>}
                </p>
                <p className="text-small text-muted-foreground">
                  {f.className ?? "All classes"} · {FREQUENCY_LABELS[f.frequency]}
                  {f.optIn ? " · opt-in" : ""}
                </p>
              </div>
              <span className="tabular font-semibold">{formatMoney(f.amount, currency)}</span>
            </button>
          )}
        />
      )}
      {canManage && <FeeDrawer key={drawer.key} open={drawer.open} onOpenChange={(o) => setDrawer((d) => ({ ...d, open: o }))} fee={drawer.fee} lookups={lookups} currency={currency} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        tone="danger"
        title={removing?.used ? `Switch off ${removing.name}?` : `Delete ${removing?.name}?`}
        description={removing?.used ? "This fee is on existing invoices, so it will be kept for history but no longer billed." : "This fee has never been billed and will be removed."}
        confirmLabel={removing?.used ? "Switch off" : "Delete"}
        onConfirm={async () => {
          try {
            const { message } = await api.delete(`/api/fees/${removing!.id}`);
            toast.success(message);
            setRemoving(null);
            router.refresh();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}
