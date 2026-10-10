"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { PasswordInput } from "@/components/common/password-input";
import { api, applyFieldErrors, errorMessage } from "@/lib/api-client";
import { resetPasswordSchema } from "@/lib/validation/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(resetPasswordSchema), defaultValues: { token, password: "", confirmPassword: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { message } = await api.post("/api/auth/reset-password", values);
      toast.success(message);
      router.replace("/login");
    } catch (error) {
      if (!applyFieldErrors(error, setError)) setFormError(errorMessage(error));
    }
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-h1">Choose a new password</h1>
        <p className="text-muted-foreground">You&apos;ll be signed out of other devices after changing it.</p>
      </div>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormAlert>
          {formError}
          {formError && (
            <>
              {" "}
              <Link href="/forgot-password" className="font-medium underline">
                Request a new link
              </Link>
            </>
          )}
        </FormAlert>
        <Field label="New password" htmlFor="password" error={errors.password?.message} hint="At least 10 characters, with a letter and a number.">
          <PasswordInput autoComplete="new-password" autoFocus {...register("password")} />
        </Field>
        <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
          <PasswordInput autoComplete="new-password" {...register("confirmPassword")} />
        </Field>
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Update password
        </Button>
      </form>
    </div>
  );
}
