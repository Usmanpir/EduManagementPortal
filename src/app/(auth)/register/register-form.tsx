"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { PasswordInput } from "@/components/common/password-input";
import { api, applyFieldErrors, errorMessage } from "@/lib/api-client";
import { COUNTRIES, registerSchema, type RegisterInput } from "@/lib/validation/auth";

export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      organizationName: "",
      country: "PK",
    } satisfies RegisterInput,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { data } = await api.post<{ redirectTo: string }>("/api/auth/register", values);
      router.replace(data.redirectTo);
      router.refresh();
    } catch (error) {
      if (!applyFieldErrors(error, setError)) setFormError(errorMessage(error));
    }
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-h1">Create your institution</h1>
        <p className="text-muted-foreground">Start a free trial — no card required. Setup takes a few minutes.</p>
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormAlert>{formError}</FormAlert>

        <Field label="Institution name" htmlFor="organizationName" error={errors.organizationName?.message} required>
          <Input autoComplete="organization" placeholder="e.g. Iqra Model School" autoFocus {...register("organizationName")} />
        </Field>

        <FieldRow>
          <Field label="First name" htmlFor="firstName" error={errors.firstName?.message} required>
            <Input autoComplete="given-name" {...register("firstName")} />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message} required>
            <Input autoComplete="family-name" {...register("lastName")} />
          </Field>
        </FieldRow>

        <Field label="Work email" htmlFor="email" error={errors.email?.message} required>
          <Input type="email" autoComplete="email" placeholder="you@school.edu.pk" {...register("email")} />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          error={errors.password?.message}
          hint="At least 10 characters, with a letter and a number."
          required
        >
          <PasswordInput autoComplete="new-password" {...register("password")} />
        </Field>

        <Field label="Country" htmlFor="country" error={errors.country?.message} required>
          <Controller
            control={control}
            name="country"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="country" aria-invalid={errors.country ? true : undefined}>
                  <SelectValue placeholder="Choose a country" />
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

        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Create account
        </Button>
        <p className="text-center text-caption text-muted-foreground">
          By creating an account you agree to keep student data accurate and use EduAttend for your institution&apos;s
          operations.
        </p>
      </form>

      <p className="text-center text-small text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
