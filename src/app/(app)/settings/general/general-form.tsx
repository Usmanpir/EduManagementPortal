"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/common/combobox";
import { Field, FieldRow } from "@/components/common/field";
import { SettingsCard } from "@/components/common/settings-card";
import { api, applyFieldErrors, errorMessage } from "@/lib/api-client";
import { COUNTRIES } from "@/lib/validation/auth";
import { organizationGeneralSchema } from "@/lib/validation/organization";
import type { z } from "zod";

type Values = z.input<typeof organizationGeneralSchema>;

const CURRENCIES = ["PKR", "USD", "AED", "SAR", "GBP", "EUR", "INR", "BDT", "QAR", "KWD", "OMR"];

export function GeneralSettingsForm({ initial, timezones }: { initial: Values; timezones: string[] }) {
  const router = useRouter();
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({ resolver: zodResolver(organizationGeneralSchema), defaultValues: initial });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const { message } = await api.patch("/api/organization", values);
      toast.success(message);
      reset(values);
      router.refresh();
    } catch (error) {
      if (!applyFieldErrors(error, setError)) toast.error(errorMessage(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <SettingsCard title="Institution" description="Shown on invoices, report cards and messages to parents.">
        <div className="flex flex-col gap-4">
          <FieldRow>
            <Field label="Institution name" htmlFor="name" error={errors.name?.message} required>
              <Input {...register("name")} />
            </Field>
            <Field label="Legal name" htmlFor="legalName" error={errors.legalName?.message} hint="Optional — used on official documents.">
              <Input {...register("legalName")} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Email" htmlFor="email" error={errors.email?.message}>
              <Input type="email" {...register("email")} placeholder="office@school.edu.pk" />
            </Field>
            <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
              <Input type="tel" {...register("phone")} placeholder="+92 51 1234567" />
            </Field>
          </FieldRow>
          <Field label="Website" htmlFor="website" error={errors.website?.message}>
            <Input type="url" {...register("website")} placeholder="https://" />
          </Field>
          <Field label="Address" htmlFor="address" error={errors.address?.message}>
            <Textarea rows={2} {...register("address")} />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="Region" description="Controls dates, school-day boundaries and currency across EduAttend.">
        <div className="flex flex-col gap-4">
          <FieldRow>
            <Field label="Country" htmlFor="country" error={errors.country?.message}>
              <Controller
                control={control}
                name="country"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="country">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Timezone" htmlFor="timezone" error={errors.timezone?.message} hint="“Today” for attendance follows this timezone.">
              <Controller
                control={control}
                name="timezone"
                render={({ field }) => (
                  <Combobox
                    id="timezone"
                    value={field.value}
                    onChange={field.onChange}
                    options={timezones.map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }))}
                    searchPlaceholder="Search timezones…"
                  />
                )}
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Currency" htmlFor="currency" error={errors.currency?.message}>
              <Controller
                control={control}
                name="currency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Default language" htmlFor="locale" error={errors.locale?.message} hint="Each person can still choose their own.">
              <Controller
                control={control}
                name="locale"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="locale">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ur">اردو (Urdu)</SelectItem>
                      <SelectItem value="ar">العربية (Arabic)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </FieldRow>
        </div>
      </SettingsCard>

      <div className="sticky bottom-20 z-(--z-sticky) flex justify-end gap-2 md:bottom-4">
        {isDirty && (
          <div className="flex animate-enter items-center gap-2 rounded-lg border bg-popover p-1.5 ps-3 shadow-lg">
            <span className="text-small text-muted-foreground">You have unsaved changes</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => reset(initial)}>
              Discard
            </Button>
            <Button type="submit" size="sm" loading={isSubmitting}>
              Save changes
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
