"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { api, applyFieldErrors, errorMessage } from "@/lib/api-client";
import { forgotPasswordSchema } from "@/lib/validation/auth";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post("/api/auth/forgot-password", values);
      setSentTo(values.email);
    } catch (error) {
      if (!applyFieldErrors(error, setError)) setFormError(errorMessage(error));
    }
  });

  if (sentTo) {
    return (
      <div className="flex flex-col gap-6">
        <span className="grid size-11 place-items-center rounded-xl bg-primary-subtle text-primary-subtle-foreground">
          <MailCheck className="size-5" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-h1">Check your email</h1>
          <p className="text-muted-foreground">
            If an account exists for <span className="font-medium text-foreground">{sentTo}</span>, a reset link is on its
            way. It expires in 60 minutes.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/login">
            <ArrowLeft className="rtl:rotate-180" /> Back to sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-h1">Forgot your password?</h1>
        <p className="text-muted-foreground">Enter your email and we&apos;ll send you a link to choose a new one.</p>
      </div>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormAlert>{formError}</FormAlert>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" autoFocus {...register("email")} />
        </Field>
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Send reset link
        </Button>
      </form>
      <Link href="/login" className="inline-flex items-center justify-center gap-1.5 text-small font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" /> Back to sign in
      </Link>
    </div>
  );
}
