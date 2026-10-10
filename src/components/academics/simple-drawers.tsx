"use client";

import { Controller } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { useApiForm } from "@/components/common/use-api-form";
import { api } from "@/lib/api-client";
import { academicYearSchema, departmentSchema, ROOM_TYPES, roomSchema } from "@/lib/validation/academics";
import { ROOM_TYPE_LABELS } from "./types";
import { FormDatePicker } from "@/components/common/date-pickers";

type DrawerProps<T> = { open: boolean; onOpenChange: (o: boolean) => void; value: T | null };

export type YearValue = { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean };

export function AcademicYearDrawer({ open, onOpenChange, value }: DrawerProps<YearValue>) {
  const nextYear = new Date().getFullYear();
  const { form, onSubmit, formError, submitting } = useApiForm({
    schema: academicYearSchema,
    defaultValues: value ?? { name: `${nextYear}–${nextYear + 1}`, startDate: `${nextYear}-08-01`, endDate: `${nextYear + 1}-06-30`, isCurrent: false },
    submit: (v) => (value ? api.patch(`/api/academic-years/${value.id}`, v) : api.post("/api/academic-years", v)),
    onSuccess: () => onOpenChange(false),
  });
  const { register, control, formState: { errors } } = form;
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={value ? `Edit ${value.name}` : "Add academic year"} formId="year-form" submitLabel={value ? "Save changes" : "Create year"} submitting={submitting}>
      <form id="year-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormAlert>{formError}</FormAlert>
        <Field label="Name" htmlFor="name" error={errors.name?.message} required>
          <Input autoFocus {...register("name")} />
        </Field>
        <FieldRow>
          <Field label="Starts" htmlFor="startDate" error={errors.startDate?.message} required>
            <FormDatePicker control={control} name="startDate" />
          </Field>
          <Field label="Ends" htmlFor="endDate" error={errors.endDate?.message} required>
            <FormDatePicker control={control} name="endDate" />
          </Field>
        </FieldRow>
        <Controller
          control={control}
          name="isCurrent"
          render={({ field }) => (
            <div className="flex items-start gap-2.5 rounded-lg border p-3">
              <Checkbox id="isCurrent" checked={!!field.value} onCheckedChange={(v) => field.onChange(v === true)} className="mt-0.5" />
              <Label htmlFor="isCurrent" className="flex flex-col items-start gap-0.5 font-normal">
                <span className="font-medium">Current academic year</span>
                <span className="text-caption text-muted-foreground">New sections, exams and fees default to this year.</span>
              </Label>
            </div>
          )}
        />
      </form>
    </FormDrawer>
  );
}

export type DepartmentValue = { id: string; name: string; code: string; description: string | null };

export function DepartmentDrawer({ open, onOpenChange, value }: DrawerProps<DepartmentValue>) {
  const { form, onSubmit, formError, submitting } = useApiForm({
    schema: departmentSchema,
    defaultValues: value ? { ...value, description: value.description ?? "" } : { name: "", code: "", description: "" },
    submit: (v) => (value ? api.patch(`/api/departments/${value.id}`, v) : api.post("/api/departments", v)),
    onSuccess: () => onOpenChange(false),
  });
  const { register, formState: { errors } } = form;
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={value ? `Edit ${value.name}` : "Add department"} formId="department-form" submitLabel={value ? "Save changes" : "Create department"} submitting={submitting}>
      <form id="department-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormAlert>{formError}</FormAlert>
        <FieldRow>
          <Field label="Name" htmlFor="name" error={errors.name?.message} required>
            <Input autoFocus placeholder="e.g. Sciences" {...register("name")} />
          </Field>
          <Field label="Code" htmlFor="code" error={errors.code?.message} required>
            <Input placeholder="e.g. SCI" className="uppercase" {...register("code")} />
          </Field>
        </FieldRow>
        <Field label="Description" htmlFor="description" error={errors.description?.message}>
          <Textarea rows={2} {...register("description")} />
        </Field>
      </form>
    </FormDrawer>
  );
}

export type RoomValue = { id: string; name: string; code: string | null; capacity: number | null; type: (typeof ROOM_TYPES)[number]; campusId: string };

export function RoomDrawer({ open, onOpenChange, value, campuses, defaultCampusId }: DrawerProps<RoomValue> & { campuses: { id: string; name: string }[]; defaultCampusId: string | null }) {
  const { form, onSubmit, formError, submitting } = useApiForm({
    schema: roomSchema,
    defaultValues: value
      ? { ...value, code: value.code ?? "", capacity: value.capacity ?? "" }
      : { name: "", code: "", capacity: "", type: "CLASSROOM", campusId: defaultCampusId ?? campuses[0]?.id ?? "" },
    submit: (v) => (value ? api.patch(`/api/rooms/${value.id}`, v) : api.post("/api/rooms", v)),
    onSuccess: () => onOpenChange(false),
  });
  const { register, control, formState: { errors } } = form;
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={value ? `Edit ${value.name}` : "Add room"} formId="room-form" submitLabel={value ? "Save changes" : "Create room"} submitting={submitting}>
      <form id="room-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormAlert>{formError}</FormAlert>
        <FieldRow>
          <Field label="Room name" htmlFor="name" error={errors.name?.message} required>
            <Input autoFocus placeholder="e.g. Room 104" {...register("name")} />
          </Field>
          <Field label="Code" htmlFor="code" error={errors.code?.message}>
            <Input placeholder="Optional" {...register("code")} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Type" htmlFor="type">
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <OptionSelect id="type" value={field.value} onChange={(v) => field.onChange(v ?? "CLASSROOM")} options={ROOM_TYPES.map((t) => ({ value: t, label: ROOM_TYPE_LABELS[t]! }))} />
              )}
            />
          </Field>
          <Field label="Capacity" htmlFor="capacity" error={errors.capacity?.message}>
            <Input type="number" inputMode="numeric" min={1} {...register("capacity")} />
          </Field>
        </FieldRow>
        <Field label="Campus" htmlFor="campusId" error={errors.campusId?.message} required>
          <Controller
            control={control}
            name="campusId"
            render={({ field }) => (
              <OptionSelect id="campusId" value={field.value} onChange={(v) => field.onChange(v ?? "")} options={campuses.map((c) => ({ value: c.id, label: c.name }))} disabled={!!value} />
            )}
          />
        </Field>
      </form>
    </FormDrawer>
  );
}
