"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { api, applyFieldErrors, errorMessage } from "@/lib/api-client";
import { inviteUserSchema } from "@/lib/validation/organization";
import type { UserRow } from "./users-view";

export type RoleOption = { id: string; key: string; name: string; grantable: boolean };
export type CampusOption = { id: string; name: string };

const ALL = "__all__";

function RoleSelect({ id, value, onChange, roles }: { id?: string; value: string; onChange: (v: string) => void; roles: RoleOption[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder="Choose a role" />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r.id} value={r.id} disabled={!r.grantable}>
            {r.name}
            {!r.grantable && <span className="text-caption text-muted-foreground"> — needs more access</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CampusSelect({ id, value, onChange, campuses }: { id?: string; value: string | null | undefined; onChange: (v: string | null) => void; campuses: CampusOption[] }) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All campuses</SelectItem>
        {campuses.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function InviteDrawer({ open, onOpenChange, roles, campuses }: { open: boolean; onOpenChange: (o: boolean) => void; roles: RoleOption[]; campuses: CampusOption[] }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const defaultRole = roles.find((r) => r.key === "teacher" && r.grantable)?.id ?? roles.find((r) => r.grantable)?.id ?? "";
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(inviteUserSchema), defaultValues: { email: "", roleId: defaultRole, campusId: null as string | null } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { message } = await api.post("/api/invitations", values);
      toast.success(message);
      reset({ email: "", roleId: defaultRole, campusId: null });
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      if (!applyFieldErrors(error, setError)) setFormError(errorMessage(error));
    }
  });

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Invite a user"
      description="They'll get an email with a link to set their password. The link expires in 7 days."
      formId="invite-form"
      submitLabel="Send invitation"
      submitting={isSubmitting}
    >
      <form id="invite-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormAlert>{formError}</FormAlert>
        <Field label="Email" htmlFor="invite-email" error={errors.email?.message} required>
          <Input type="email" autoFocus placeholder="teacher@school.edu.pk" {...register("email")} />
        </Field>
        <Field label="Role" htmlFor="invite-role" error={errors.roleId?.message} required>
          <Controller control={control} name="roleId" render={({ field }) => <RoleSelect id="invite-role" value={field.value} onChange={field.onChange} roles={roles} />} />
        </Field>
        <Field label="Campus access" htmlFor="invite-campus" hint="Limit this person to one campus, or give access to all.">
          <Controller
            control={control}
            name="campusId"
            render={({ field }) => <CampusSelect id="invite-campus" value={field.value} onChange={field.onChange} campuses={campuses} />}
          />
        </Field>
      </form>
    </FormDrawer>
  );
}

const accessSchema = z.object({
  roles: z
    .array(z.object({ roleId: z.string().min(1, "Choose a role."), campusId: z.string().nullable() }))
    .min(1, "Give the user at least one role."),
});

export function AccessDrawer({ user, roles, campuses, onClose }: { user: UserRow; roles: RoleOption[]; campuses: CampusOption[]; onClose: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(accessSchema),
    defaultValues: { roles: user.roles.map((r) => ({ roleId: r.roleId, campusId: r.campusId })) },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "roles" });

  const close = (o: boolean) => {
    setOpen(o);
    if (!o) setTimeout(onClose, 200);
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.patch(`/api/users/${user.id}`, values);
      toast.success(`Access updated for ${user.name}.`);
      close(false);
      router.refresh();
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  return (
    <FormDrawer
      open={open}
      onOpenChange={close}
      title={`Access for ${user.name}`}
      description="Roles decide what someone can do. Limit a role to a campus to restrict where they can do it."
      formId="access-form"
      submitLabel="Save access"
      submitting={isSubmitting}
    >
      <form id="access-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormAlert>{formError ?? errors.roles?.root?.message ?? errors.roles?.message}</FormAlert>
        <ul className="flex flex-col gap-3">
          {fields.map((f, index) => (
            <li key={f.id} className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-end">
              <Field label="Role" htmlFor={`role-${index}`} className="flex-1" error={errors.roles?.[index]?.roleId?.message}>
                <Controller
                  control={control}
                  name={`roles.${index}.roleId`}
                  render={({ field }) => <RoleSelect id={`role-${index}`} value={field.value} onChange={field.onChange} roles={roles} />}
                />
              </Field>
              <Field label="Campus" htmlFor={`campus-${index}`} className="flex-1">
                <Controller
                  control={control}
                  name={`roles.${index}.campusId`}
                  render={({ field }) => <CampusSelect id={`campus-${index}`} value={field.value} onChange={field.onChange} campuses={campuses} />}
                />
              </Field>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove role" onClick={() => remove(index)} disabled={fields.length === 1}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" className="self-start" onClick={() => append({ roleId: "", campusId: null })}>
          <Plus /> Add another role
        </Button>
      </form>
    </FormDrawer>
  );
}
