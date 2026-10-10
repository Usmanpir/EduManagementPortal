"use client";

import { useState } from "react";
import { Controller } from "react-hook-form";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { useApiForm } from "@/components/common/use-api-form";
import { api } from "@/lib/api-client";
import { classSchema } from "@/lib/validation/academics";
import type { AcademicLookups } from "./types";

export type ClassFormValue = {
  id: string;
  name: string;
  level: number;
  campusId: string;
  departmentId: string | null;
  description: string | null;
};

/** Small "A B C" style chip input for creating sections together with a class. */
function SectionNamesInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const names = raw
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (names.length) onChange([...new Set([...value, ...names])].slice(0, 26));
    setDraft("");
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 shadow-xs focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/40">
      {value.map((name) => (
        <span key={name} className="inline-flex h-6 items-center gap-1 rounded-sm bg-primary-subtle ps-2 pe-1 text-small font-medium text-primary-subtle-foreground">
          {name}
          <button type="button" aria-label={`Remove section ${name}`} onClick={() => onChange(value.filter((v) => v !== name))} className="grid size-4 place-items-center rounded-xs hover:bg-primary/15">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id="sections"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "," || e.key === " ") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
        placeholder={value.length ? "" : "Type A, B, C…"}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground"
      />
    </div>
  );
}

export function ClassDrawer({
  open,
  onOpenChange,
  lookups,
  value,
  defaultCampusId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lookups: AcademicLookups;
  value: ClassFormValue | null;
  defaultCampusId: string | null;
}) {
  const { form, onSubmit, formError, submitting } = useApiForm({
    schema: classSchema,
    defaultValues: value
      ? { name: value.name, level: value.level, campusId: value.campusId, departmentId: value.departmentId, description: value.description ?? "", sections: [] }
      : { name: "", level: 1, campusId: defaultCampusId ?? lookups.campuses[0]?.id ?? "", departmentId: null, description: "", sections: ["A"] },
    submit: (v) => (value ? api.patch(`/api/classes/${value.id}`, v) : api.post("/api/classes", v)),
    onSuccess: () => onOpenChange(false),
  });
  const { register, control, formState: { errors } } = form;

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={value ? `Edit ${value.name}` : "Add class"}
      description={value ? undefined : "A class (grade) holds one or more sections, e.g. Grade 10 with sections A, B and C."}
      formId="class-form"
      submitLabel={value ? "Save changes" : "Create class"}
      submitting={submitting}
    >
      <form id="class-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormAlert>{formError}</FormAlert>
        <FieldRow>
          <Field label="Class name" htmlFor="name" error={errors.name?.message} required>
            <Input autoFocus placeholder="e.g. Grade 10" {...register("name")} />
          </Field>
          <Field label="Order" htmlFor="level" error={errors.level?.message} hint="Sorts classes, e.g. 10 for Grade 10.">
            <Input type="number" inputMode="numeric" min={0} max={30} {...register("level")} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Campus" htmlFor="campusId" error={errors.campusId?.message} required>
            <Controller
              control={control}
              name="campusId"
              render={({ field }) => (
                <OptionSelect id="campusId" value={field.value} onChange={(v) => field.onChange(v ?? "")} options={lookups.campuses.map((c) => ({ value: c.id, label: c.name }))} disabled={!!value} />
              )}
            />
          </Field>
          <Field label="Department" htmlFor="departmentId" hint="Optional — e.g. Primary, Secondary.">
            <Controller
              control={control}
              name="departmentId"
              render={({ field }) => (
                <OptionSelect id="departmentId" value={field.value} onChange={field.onChange} options={lookups.departments.map((d) => ({ value: d.id, label: d.name }))} noneLabel="No department" />
              )}
            />
          </Field>
        </FieldRow>
        {!value && (
          <Field label="Sections" htmlFor="sections" hint="Press Enter after each. You can add more later.">
            <Controller control={control} name="sections" render={({ field }) => <SectionNamesInput value={field.value ?? []} onChange={field.onChange} />} />
          </Field>
        )}
        <Field label="Notes" htmlFor="description" error={errors.description?.message}>
          <Textarea rows={2} {...register("description")} />
        </Field>
      </form>
    </FormDrawer>
  );
}
