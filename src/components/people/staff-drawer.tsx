"use client";

import { useRouter } from "next/navigation";
import { Controller, useWatch } from "react-hook-form";
import type { z } from "zod";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldRow, FormSection } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { useApiForm } from "@/components/common/use-api-form";
import { api } from "@/lib/api-client";
import { GENDERS, STAFF_STATUSES, staffSchema } from "@/lib/validation/people";
import { GENDER_LABELS, STAFF_STATUS_BADGE, type PeopleLookups } from "./types";
import { FormDatePicker } from "@/components/common/date-pickers";

export type StaffFormValue = z.input<typeof staffSchema> & { id: string; hasLogin: boolean };

export function StaffDrawer({
  open,
  onOpenChange,
  lookups,
  value,
  defaultCampusId,
  kind,
  canToggleTeacher,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lookups: PeopleLookups;
  value: StaffFormValue | null;
  defaultCampusId: string | null;
  kind: "teacher" | "staff";
  /** Changing teacher status needs both teachers.manage and staff.manage. */
  canToggleTeacher: boolean;
}) {
  const router = useRouter();
  const isEdit = !!value;
  const { form, onSubmit, formError, submitting } = useApiForm({
    schema: staffSchema,
    defaultValues: value ?? {
      firstName: "",
      lastName: "",
      gender: null,
      dateOfBirth: "",
      cnic: "",
      phone: "",
      email: "",
      address: "",
      campusId: defaultCampusId ?? lookups.campuses[0]?.id ?? "",
      departmentId: null,
      designation: kind === "teacher" ? "Teacher" : "",
      employeeCode: "",
      joiningDate: new Date().toISOString().slice(0, 10),
      status: "ACTIVE",
      isTeacher: kind === "teacher",
      qualification: "",
      specialization: "",
      inviteToSignIn: true,
    },
    submit: async (v) => {
      if (isEdit) return api.patch(`/api/staff/${value.id}`, v);
      const res = await api.post<{ id: string }>("/api/staff", v);
      router.push(`/${v.isTeacher ? "teachers" : "staff"}/${res.data.id}`);
      return res;
    },
    onSuccess: () => onOpenChange(false),
  });
  const { register, control, formState: { errors } } = form;
  const [isTeacher, email] = useWatch({ control, name: ["isTeacher", "email"] });
  const noun = isTeacher ? "teacher" : "staff member";

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit ${value.firstName} ${value.lastName}` : `Add ${noun}`}
      formId="staff-form"
      submitLabel={isEdit ? "Save changes" : `Add ${noun}`}
      submitting={submitting}
      size="lg"
    >
      <form id="staff-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
        <FormAlert>{formError}</FormAlert>
        <FormSection title="Personal information">
          <FieldRow>
            <Field label="First name" htmlFor="firstName" error={errors.firstName?.message} required>
              <Input autoFocus {...register("firstName")} />
            </Field>
            <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message} required>
              <Input {...register("lastName")} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Gender" htmlFor="gender">
              <Controller control={control} name="gender" render={({ field }) => <OptionSelect id="gender" value={field.value} onChange={field.onChange} options={GENDERS.map((g) => ({ value: g, label: GENDER_LABELS[g]! }))} noneLabel="Not specified" />} />
            </Field>
            {lookups.identity.staffCnic ? (
              <Field label="CNIC" htmlFor="cnic" error={errors.cnic?.message}>
                <Input inputMode="numeric" placeholder="12345-1234567-1" {...register("cnic")} />
              </Field>
            ) : (
              <Field label="Date of birth" htmlFor="dateOfBirth" error={errors.dateOfBirth?.message}>
                <FormDatePicker control={control} name="dateOfBirth" clearable />
              </Field>
            )}
          </FieldRow>
          <FieldRow>
            <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
              <Input type="tel" {...register("phone")} />
            </Field>
            <Field label="Email" htmlFor="email" error={errors.email?.message} hint="Used to sign in to EduAttend.">
              <Input type="email" {...register("email")} />
            </Field>
          </FieldRow>
          <Field label="Address" htmlFor="address">
            <Textarea rows={2} {...register("address")} />
          </Field>
        </FormSection>

        <FormSection title="Employment">
          {canToggleTeacher && (
            <Controller
              control={control}
              name="isTeacher"
              render={({ field }) => (
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <Label htmlFor="isTeacher" className="flex flex-col items-start gap-0.5 font-normal">
                    <span className="font-medium">This person teaches</span>
                    <span className="text-caption text-muted-foreground">Teachers can be assigned subjects and mark attendance for their classes.</span>
                  </Label>
                  <Switch id="isTeacher" checked={!!field.value} onCheckedChange={field.onChange} />
                </div>
              )}
            />
          )}
          <FieldRow>
            <Field label="Designation" htmlFor="designation" error={errors.designation?.message} required>
              <Input placeholder={isTeacher ? "e.g. Senior Teacher" : "e.g. Accounts Officer"} {...register("designation")} />
            </Field>
            <Field label="Department" htmlFor="departmentId">
              <Controller control={control} name="departmentId" render={({ field }) => <OptionSelect id="departmentId" value={field.value} onChange={field.onChange} options={lookups.departments.map((d) => ({ value: d.id, label: d.name }))} noneLabel="No department" />} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Campus" htmlFor="campusId" error={errors.campusId?.message} required>
              <Controller control={control} name="campusId" render={({ field }) => <OptionSelect id="campusId" value={field.value} onChange={(v) => field.onChange(v ?? "")} options={lookups.campuses.map((c) => ({ value: c.id, label: c.name }))} />} />
            </Field>
            <Field label="Employee ID" htmlFor="employeeCode" error={errors.employeeCode?.message} hint={isEdit ? undefined : "Leave blank to generate one."}>
              <Input placeholder={isEdit ? undefined : "Auto, e.g. EMP-014"} {...register("employeeCode")} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Joining date" htmlFor="joiningDate" error={errors.joiningDate?.message}>
              <FormDatePicker control={control} name="joiningDate" />
            </Field>
            {isEdit && (
              <Field label="Status" htmlFor="status">
                <Controller control={control} name="status" render={({ field }) => <OptionSelect id="status" value={field.value} onChange={(v) => field.onChange(v ?? "ACTIVE")} options={STAFF_STATUSES.map((s) => ({ value: s, label: STAFF_STATUS_BADGE[s]!.label }))} />} />
              </Field>
            )}
          </FieldRow>
          {isTeacher && (
            <FieldRow>
              <Field label="Qualification" htmlFor="qualification">
                <Input placeholder="e.g. M.Sc Mathematics, B.Ed" {...register("qualification")} />
              </Field>
              <Field label="Specialization" htmlFor="specialization">
                <Input placeholder="e.g. Mathematics" {...register("specialization")} />
              </Field>
            </FieldRow>
          )}
        </FormSection>

        {!value?.hasLogin && (
          <Controller
            control={control}
            name="inviteToSignIn"
            render={({ field }) => (
              <div className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3">
                <Checkbox id="inviteToSignIn" checked={!!field.value} onCheckedChange={(v) => field.onChange(v === true)} disabled={!email} className="mt-0.5" />
                <Label htmlFor="inviteToSignIn" className="flex flex-col items-start gap-0.5 font-normal">
                  <span className="font-medium">Invite to sign in</span>
                  <span className="text-caption text-muted-foreground">
                    {email ? `We'll email ${email} a link to set their password${isTeacher ? " and start marking attendance" : ""}.` : "Add an email address to send a sign-in invitation."}
                  </span>
                </Label>
              </div>
            )}
          />
        )}
      </form>
    </FormDrawer>
  );
}
