"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type DefaultValues, type FieldValues, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { applyFieldErrors, errorMessage } from "@/lib/api-client";

/**
 * Standard create/edit form: Zod validation, server field errors mapped onto
 * inputs, form-level errors in `formError`, success toast + page refresh.
 */
export function useApiForm<S extends z.ZodType<FieldValues, FieldValues>>({
  schema,
  defaultValues,
  submit,
  onSuccess,
  refresh = true,
}: {
  schema: S;
  defaultValues: DefaultValues<z.input<S>>;
  submit: (values: z.output<S>) => Promise<{ message: string }>;
  onSuccess?: (values: z.output<S>) => void;
  refresh?: boolean;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<S>, unknown, z.output<S>>({
    resolver: zodResolver(schema as never) as unknown as Resolver<z.input<S>, unknown, z.output<S>>,
    defaultValues,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { message } = await submit(values);
      toast.success(message);
      onSuccess?.(values);
      if (refresh) router.refresh();
    } catch (error) {
      if (!applyFieldErrors(error, form.setError)) setFormError(errorMessage(error));
    }
  });

  return { form, onSubmit, formError, submitting: form.formState.isSubmitting };
}
