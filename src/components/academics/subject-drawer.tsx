"use client";

import { Controller } from "react-hook-form";
import { Check } from "lucide-react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { useApiForm } from "@/components/common/use-api-form";
import { api } from "@/lib/api-client";
import { SUBJECT_TYPES, subjectSchema } from "@/lib/validation/academics";
import { SUBJECT_COLORS, SUBJECT_TYPE_LABELS } from "./types";

export type SubjectFormValue = { id: string; name: string; code: string; type: (typeof SUBJECT_TYPES)[number]; departmentId: string | null; color: string | null };

export function SubjectDrawer({
  open,
  onOpenChange,
  departments,
  value,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: { id: string; name: string }[];
  value: SubjectFormValue | null;
}) {
  const { form, onSubmit, formError, submitting } = useApiForm({
    schema: subjectSchema,
    defaultValues: value ?? { name: "", code: "", type: "CORE", departmentId: null, color: SUBJECT_COLORS[0] },
    submit: (v) => (value ? api.patch(`/api/subjects/${value.id}`, v) : api.post("/api/subjects", v)),
    onSuccess: () => onOpenChange(false),
  });
  const { register, control, formState: { errors } } = form;

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={value ? `Edit ${value.name}` : "Add subject"}
      formId="subject-form"
      submitLabel={value ? "Save changes" : "Create subject"}
      submitting={submitting}
    >
      <form id="subject-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormAlert>{formError}</FormAlert>
        <FieldRow>
          <Field label="Subject name" htmlFor="name" error={errors.name?.message} required>
            <Input autoFocus placeholder="e.g. Mathematics" {...register("name")} />
          </Field>
          <Field label="Code" htmlFor="code" error={errors.code?.message} required>
            <Input placeholder="e.g. MATH" className="uppercase" maxLength={12} {...register("code")} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Type" htmlFor="type">
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <OptionSelect id="type" value={field.value} onChange={(v) => field.onChange(v ?? "CORE")} options={SUBJECT_TYPES.map((t) => ({ value: t, label: SUBJECT_TYPE_LABELS[t]! }))} />
              )}
            />
          </Field>
          <Field label="Department" htmlFor="departmentId">
            <Controller
              control={control}
              name="departmentId"
              render={({ field }) => (
                <OptionSelect id="departmentId" value={field.value} onChange={field.onChange} options={departments.map((d) => ({ value: d.id, label: d.name }))} noneLabel="No department" />
              )}
            />
          </Field>
        </FieldRow>
        <Field label="Colour" htmlFor="color" hint="Used on timetables and exam schedules.">
          <Controller
            control={control}
            name="color"
            render={({ field }) => (
              <div id="color" role="radiogroup" aria-label="Subject colour" className="flex flex-wrap gap-2">
                {SUBJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={field.value === c}
                    aria-label={c}
                    onClick={() => field.onChange(c)}
                    className={cn("grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-card outline-none focus-visible:ring-2 focus-visible:ring-ring", field.value === c && "ring-2 ring-foreground/40")}
                    style={{ backgroundColor: c }}
                  >
                    {field.value === c && <Check className="size-4 text-white" />}
                  </button>
                ))}
              </div>
            )}
          />
        </Field>
      </form>
    </FormDrawer>
  );
}
