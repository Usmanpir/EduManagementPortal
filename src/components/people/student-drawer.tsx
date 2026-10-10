"use client";

import { useRouter } from "next/navigation";
import { Controller, useWatch } from "react-hook-form";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/common/combobox";
import { Field, FieldRow, FormSection } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { useApiForm } from "@/components/common/use-api-form";
import { api } from "@/lib/api-client";
import { GENDERS, STUDENT_STATUSES, studentSchema } from "@/lib/validation/people";
import { GuardianFields } from "./guardian-fields";
import { GENDER_LABELS, STUDENT_STATUS_BADGE, type PeopleLookups } from "./types";
import { FormDatePicker } from "@/components/common/date-pickers";

export type StudentFormValue = z.input<typeof studentSchema> & { id: string };

const NONE = "__none__";

export function StudentDrawer({
  open,
  onOpenChange,
  lookups,
  value,
  defaultCampusId,
  defaultSectionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lookups: PeopleLookups;
  value: StudentFormValue | null;
  defaultCampusId: string | null;
  defaultSectionId?: string | null;
}) {
  const router = useRouter();
  const isEdit = !!value;
  const campusId0 = defaultCampusId ?? lookups.campuses[0]?.id ?? "";
  const { form, onSubmit, formError, submitting } = useApiForm({
    schema: studentSchema,
    defaultValues: value ?? {
      firstName: "",
      lastName: "",
      gender: null,
      dateOfBirth: "",
      bFormNumber: "",
      campusId: campusId0,
      sectionId: defaultSectionId ?? null,
      rollNumber: "",
      admissionNo: "",
      admissionDate: "",
      status: "ACTIVE",
      phone: "",
      email: "",
      address: "",
      city: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      guardians: [{ id: null, firstName: "", lastName: "", relation: "FATHER", phone: "", whatsapp: "", email: "", cnic: "", occupation: "", isPrimary: true, receivesNotifications: true }],
    },
    submit: async (v) => {
      if (isEdit) return api.patch(`/api/students/${value.id}`, v);
      const res = await api.post<{ id: string }>("/api/students", v);
      router.push(`/students/${res.data.id}`);
      return res;
    },
    onSuccess: () => onOpenChange(false),
  });
  const { register, control, setValue, formState: { errors } } = form;
  const [campusId, guardianId, guardianPhone] = useWatch({ control, name: ["campusId", "guardians.0.id", "guardians.0.phone"] });
  const sections = lookups.sections.filter((s) => s.campusId === campusId);

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit ${value.firstName} ${value.lastName}` : "Add student"}
      description={isEdit ? undefined : "Only the name and guardian phone are required — you can complete the rest later."}
      formId="student-form"
      submitLabel={isEdit ? "Save changes" : "Add student"}
      submitting={submitting}
      size="lg"
    >
      <form id="student-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
        <FormAlert>{formError}</FormAlert>

        <FormSection title="Student information">
          <FieldRow>
            <Field label="First name" htmlFor="firstName" error={errors.firstName?.message} required>
              <Input autoFocus autoComplete="off" {...register("firstName")} />
            </Field>
            <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message} required>
              <Input autoComplete="off" {...register("lastName")} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Gender" htmlFor="gender">
              <Controller
                control={control}
                name="gender"
                render={({ field }) => (
                  <OptionSelect id="gender" value={field.value} onChange={field.onChange} options={GENDERS.map((g) => ({ value: g, label: GENDER_LABELS[g]! }))} noneLabel="Not specified" />
                )}
              />
            </Field>
            <Field label="Date of birth" htmlFor="dateOfBirth" error={errors.dateOfBirth?.message}>
              <FormDatePicker control={control} name="dateOfBirth" clearable />
            </Field>
          </FieldRow>
          {(lookups.identity.studentBForm || lookups.identity.studentCnic) && (
            <FieldRow>
              {lookups.identity.studentBForm && (
                <Field label="B-Form number" htmlFor="bFormNumber" error={errors.bFormNumber?.message}>
                  <Input inputMode="numeric" placeholder="12345-1234567-1" {...register("bFormNumber")} />
                </Field>
              )}
              {lookups.identity.studentCnic && (
                <Field label="CNIC" htmlFor="cnic" error={errors.cnic?.message}>
                  <Input inputMode="numeric" placeholder="12345-1234567-1" {...register("cnic")} />
                </Field>
              )}
            </FieldRow>
          )}
        </FormSection>

        <FormSection title="Academic placement">
          <FieldRow>
            <Field label="Campus" htmlFor="campusId" error={errors.campusId?.message} required>
              <Controller
                control={control}
                name="campusId"
                render={({ field }) => (
                  <OptionSelect
                    id="campusId"
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v ?? "");
                      setValue("sectionId", null);
                    }}
                    options={lookups.campuses.map((c) => ({ value: c.id, label: c.name }))}
                  />
                )}
              />
            </Field>
            <Field label="Class & section" htmlFor="sectionId" error={errors.sectionId?.message} hint={sections.length === 0 ? "Create classes on this campus first." : undefined}>
              <Controller
                control={control}
                name="sectionId"
                render={({ field }) => (
                  <Combobox
                    id="sectionId"
                    value={field.value ?? NONE}
                    onChange={(v) => field.onChange(v === NONE ? null : v)}
                    options={[{ value: NONE, label: "Not placed yet" }, ...sections.map((s) => ({ value: s.id, label: s.label }))]}
                    searchPlaceholder="Search classes…"
                    disabled={sections.length === 0}
                  />
                )}
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Roll number" htmlFor="rollNumber" error={errors.rollNumber?.message}>
              <Input inputMode="numeric" {...register("rollNumber")} />
            </Field>
            <Field label="Admission number" htmlFor="admissionNo" error={errors.admissionNo?.message} hint={isEdit ? undefined : "Leave blank to generate one."}>
              <Input placeholder={isEdit ? undefined : "Auto, e.g. STU-1024"} {...register("admissionNo")} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Admission date" htmlFor="admissionDate" error={errors.admissionDate?.message}>
              <FormDatePicker control={control} name="admissionDate" />
            </Field>
            {isEdit && (
              <Field label="Status" htmlFor="status">
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <OptionSelect id="status" value={field.value} onChange={(v) => field.onChange(v ?? "ACTIVE")} options={STUDENT_STATUSES.map((s) => ({ value: s, label: STUDENT_STATUS_BADGE[s]!.label }))} />
                  )}
                />
              </Field>
            )}
          </FieldRow>
        </FormSection>

        {!isEdit && (
          <FormSection title="Parent or guardian" description="They'll receive absence and fee alerts. You can add more guardians from the profile.">
            <GuardianFields
              prefix="guardians.0."
              register={register}
              control={control}
              setValue={setValue}
              errors={errors.guardians?.[0] as never}
              showCnic={lookups.identity.guardianCnic}
              linkedId={guardianId}
              phone={guardianPhone}
            />
          </FormSection>
        )}

        <FormSection title="Contact & emergency">
          <FieldRow>
            <Field label="Student phone" htmlFor="phone" error={errors.phone?.message}>
              <Input type="tel" {...register("phone")} />
            </Field>
            <Field label="Student email" htmlFor="email" error={errors.email?.message} hint="Needed for student portal access.">
              <Input type="email" {...register("email")} />
            </Field>
          </FieldRow>
          <Field label="Address" htmlFor="address" error={errors.address?.message}>
            <Textarea rows={2} {...register("address")} />
          </Field>
          <FieldRow>
            <Field label="Emergency contact" htmlFor="emergencyContactName">
              <Input {...register("emergencyContactName")} />
            </Field>
            <Field label="Emergency phone" htmlFor="emergencyContactPhone" error={errors.emergencyContactPhone?.message}>
              <Input type="tel" {...register("emergencyContactPhone")} />
            </Field>
          </FieldRow>
          <Field label="Medical notes" htmlFor="medicalNotes" hint="Allergies or conditions staff should know about.">
            <Textarea rows={2} {...register("medicalNotes")} />
          </Field>
        </FormSection>
      </form>
    </FormDrawer>
  );
}
