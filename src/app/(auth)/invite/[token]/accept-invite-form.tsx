"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { PasswordInput } from "@/components/common/password-input";
import { api, applyFieldErrors, errorMessage } from "@/lib/api-client";
import { acceptInviteSchema } from "@/lib/validation/auth";

export function AcceptInviteForm({ token, invitation }: { token: string; invitation: { email: string; organizationName: string; roleName: string } }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(acceptInviteSchema), defaultValues: { token, firstName: "", lastName: "", password: "", confirmPassword: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { data } = await api.post<{ redirectTo: string }>("/api/auth/accept-invite", values);
      router.replace(data.redirectTo);
      router.refresh();
    } catch (error) {
      if (!applyFieldErrors(error, setError)) setFormError(errorMessage(error));
    }
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <p className="text-small font-medium text-primary">{invitation.organizationName}</p>
        <h1 className="text-h1">Join your team on EduAttend</h1>
        <p className="text-muted-foreground">
          You&apos;ve been invited as <span className="font-medium text-foreground">{invitation.roleName}</span>. Set up your account
          for <span className="font-medium text-foreground">{invitation.email}</span>.
        </p>
      </div>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormAlert>{formError}</FormAlert>
        <FieldRow>
          <Field label="First name" htmlFor="firstName" error={errors.firstName?.message} required>
            <Input autoComplete="given-name" autoFocus {...register("firstName")} />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message} required>
            <Input autoComplete="family-name" {...register("lastName")} />
          </Field>
        </FieldRow>
        <Field label="Password" htmlFor="password" error={errors.password?.message} hint="At least 10 characters, with a letter and a number." required>
          <PasswordInput autoComplete="new-password" {...register("password")} />
        </Field>
        <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message} required>
          <PasswordInput autoComplete="new-password" {...register("confirmPassword")} />
        </Field>
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Create account & continue
        </Button>
      </form>
    </div>
  );
}
