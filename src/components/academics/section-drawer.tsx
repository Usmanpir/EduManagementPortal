"use client";

import { Controller } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { Combobox } from "@/components/common/combobox";
import { useApiForm } from "@/components/common/use-api-form";
import { api } from "@/lib/api-client";
import { sectionSchema } from "@/lib/validation/academics";
import type { AcademicLookups } from "./types";

export type SectionFormValue = {
  id: string;
  name: string;
  classId: string;
  capacity: number | null;
  classTeacherId: string | null;
  roomId: string | null;
  academicYearId: string | null;
};

export function SectionDrawer({
  open,
  onOpenChange,
  lookups,
  classes,
  value,
  defaultClassId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lookups: AcademicLookups;
  classes: { id: string; name: string; campusId: string }[];
  value: SectionFormValue | null;
  defaultClassId?: string | null;
}) {
  const { form, onSubmit, formError, submitting } = useApiForm({
    schema: sectionSchema,
    defaultValues: value
      ? { ...value, capacity: value.capacity ?? "" }
      : {
          name: "",
          classId: defaultClassId ?? classes[0]?.id ?? "",
          capacity: "",
          classTeacherId: null,
          roomId: null,
          academicYearId: lookups.years.find((y) => y.isCurrent)?.id ?? null,
        },
    submit: (v) => (value ? api.patch(`/api/sections/${value.id}`, v) : api.post("/api/sections", v)),
    onSuccess: () => onOpenChange(false),
  });
  const {
    register,
    control,
    watch,
    formState: { errors },
  } = form;
  const classId = watch("classId");
  const campusId = classes.find((c) => c.id === classId)?.campusId;
  const staff = lookups.staff.filter((s) => !campusId || s.campusId === campusId);
  const rooms = lookups.rooms.filter((r) => !campusId || r.campusId === campusId);

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={value ? `Edit section ${value.name}` : "Add section"}
      formId="section-form"
      submitLabel={value ? "Save changes" : "Create section"}
      submitting={submitting}
    >
      <form id="section-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormAlert>{formError}</FormAlert>
        <FieldRow>
          <Field label="Class" htmlFor="classId" error={errors.classId?.message} required>
            <Controller
              control={control}
              name="classId"
              render={({ field }) => (
                <OptionSelect id="classId" value={field.value} onChange={(v) => field.onChange(v ?? "")} options={classes.map((c) => ({ value: c.id, label: c.name }))} disabled={!!value || !!defaultClassId} />
              )}
            />
          </Field>
          <Field label="Section name" htmlFor="name" error={errors.name?.message} required>
            <Input autoFocus placeholder="e.g. A" className="uppercase" maxLength={20} {...register("name")} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Capacity" htmlFor="capacity" error={errors.capacity?.message} hint="Optional maximum number of students.">
            <Input type="number" inputMode="numeric" min={1} {...register("capacity")} />
          </Field>
          <Field label="Academic year" htmlFor="academicYearId">
            <Controller
              control={control}
              name="academicYearId"
              render={({ field }) => (
                <OptionSelect
                  id="academicYearId"
                  value={field.value}
                  onChange={field.onChange}
                  options={lookups.years.map((y) => ({ value: y.id, label: y.name, hint: y.isCurrent ? "current" : undefined }))}
                  noneLabel="Not set"
                />
              )}
            />
          </Field>
        </FieldRow>
        <Field label="Class teacher" htmlFor="classTeacherId" hint={staff.length === 0 ? "Add staff first to choose a class teacher." : "Receives this section's absence alerts and can mark its attendance."}>
          <Controller
            control={control}
            name="classTeacherId"
            render={({ field }) => (
              <Combobox
                id="classTeacherId"
                value={field.value ?? "__none__"}
                onChange={(v) => field.onChange(v === "__none__" ? null : v)}
                options={[{ value: "__none__", label: "No class teacher" }, ...staff.map((s) => ({ value: s.id, label: s.name, hint: s.designation }))]}
                searchPlaceholder="Search staff…"
                disabled={staff.length === 0}
              />
            )}
          />
        </Field>
        <Field label="Home room" htmlFor="roomId">
          <Controller
            control={control}
            name="roomId"
            render={({ field }) => (
              <OptionSelect id="roomId" value={field.value} onChange={field.onChange} options={rooms.map((r) => ({ value: r.id, label: r.name }))} noneLabel="No room" />
            )}
          />
        </Field>
      </form>
    </FormDrawer>
  );
}
