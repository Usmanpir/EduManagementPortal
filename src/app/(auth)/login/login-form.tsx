"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { PasswordInput } from "@/components/common/password-input";
import { useI18n } from "@/components/providers/i18n-provider";
import { api, applyFieldErrors, errorMessage } from "@/lib/api-client";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

export function LoginForm({ next }: { next: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", remember: true } satisfies LoginInput,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { data } = await api.post<{ redirectTo: string }>("/api/auth/login", values);
      router.replace(next ?? data.redirectTo);
      router.refresh();
    } catch (error) {
      if (!applyFieldErrors(error, setError)) setFormError(errorMessage(error));
    }
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-h1">{t("auth.welcomeBack")}</h1>
        <p className="text-muted-foreground">{t("auth.signInSubtitle")}</p>
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormAlert>{formError}</FormAlert>

        <Field label={t("auth.email")} htmlFor="email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" autoFocus placeholder="you@school.edu.pk" {...register("email")} />
        </Field>

        <Field
          label={t("auth.password")}
          htmlFor="password"
          error={errors.password?.message}
          aside={
            <Link href="/forgot-password" className="text-small font-medium text-primary hover:underline">
              {t("auth.forgotPassword")}
            </Link>
          }
        >
          <PasswordInput autoComplete="current-password" {...register("password")} />
        </Field>

        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="remember"
            render={({ field }) => (
              <Checkbox id="remember" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
            )}
          />
          <Label htmlFor="remember" className="text-small font-normal">
            {t("auth.rememberMe")}
          </Label>
        </div>

        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          {t("auth.signIn")}
        </Button>
      </form>

      <p className="text-center text-small text-muted-foreground">
        {t("auth.noAccount")}{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          {t("auth.createAccount")}
        </Link>
      </p>
    </div>
  );
}
