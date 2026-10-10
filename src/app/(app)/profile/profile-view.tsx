"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatInTimeZone } from "date-fns-tz";
import { LogOut, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldRow } from "@/components/common/field";
import { PasswordInput } from "@/components/common/password-input";
import { SettingsCard } from "@/components/common/settings-card";
import { api, applyFieldErrors, errorMessage } from "@/lib/api-client";
import { changePasswordSchema, profileSchema } from "@/lib/validation/organization";

type Session = { id: string; ipAddress: string | null; userAgent: string | null; lastSeenAt: string; current: boolean };

/** "Chrome on Windows" from a user agent, without a parsing library. */
function deviceLabel(ua: string | null) {
  if (!ua) return { label: "Unknown device", mobile: false };
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return { label: os ? `${browser} on ${os}` : browser, mobile: /Mobile|Android|iPhone/.test(ua) };
}

export function ProfileView({ user, sessions, timezone }: { user: { firstName: string; lastName: string; phone: string; email: string }; sessions: Session[]; timezone: string }) {
  const router = useRouter();
  const profile = useForm({ resolver: zodResolver(profileSchema), defaultValues: { firstName: user.firstName, lastName: user.lastName, phone: user.phone } });
  const password = useForm({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" } });

  const saveProfile = profile.handleSubmit(async (values) => {
    try {
      const { message } = await api.patch("/api/me", values);
      toast.success(message);
      profile.reset(values);
      router.refresh();
    } catch (error) {
      if (!applyFieldErrors(error, profile.setError)) toast.error(errorMessage(error));
    }
  });

  const savePassword = password.handleSubmit(async (values) => {
    try {
      const { message } = await api.put("/api/me", values);
      toast.success(message);
      password.reset();
      router.refresh();
    } catch (error) {
      if (!applyFieldErrors(error, password.setError)) toast.error(errorMessage(error));
    }
  });

  const revoke = async (id: string) => {
    try {
      const { message } = await api.delete(`/api/me/sessions/${id}`);
      toast.success(message);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <form onSubmit={saveProfile} noValidate>
        <SettingsCard
          title="Personal details"
          description={`You sign in with ${user.email}.`}
          footer={
            <Button type="submit" loading={profile.formState.isSubmitting} disabled={!profile.formState.isDirty}>
              Save changes
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <FieldRow>
              <Field label="First name" htmlFor="firstName" error={profile.formState.errors.firstName?.message} required>
                <Input {...profile.register("firstName")} />
              </Field>
              <Field label="Last name" htmlFor="lastName" error={profile.formState.errors.lastName?.message} required>
                <Input {...profile.register("lastName")} />
              </Field>
            </FieldRow>
            <Field label="Phone" htmlFor="phone" error={profile.formState.errors.phone?.message}>
              <Input type="tel" {...profile.register("phone")} />
            </Field>
          </div>
        </SettingsCard>
      </form>

      <form onSubmit={savePassword} noValidate>
        <SettingsCard
          title="Password"
          description="Changing your password signs you out on every other device."
          footer={
            <Button type="submit" loading={password.formState.isSubmitting}>
              Change password
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Current password" htmlFor="currentPassword" error={password.formState.errors.currentPassword?.message}>
              <PasswordInput autoComplete="current-password" {...password.register("currentPassword")} />
            </Field>
            <FieldRow>
              <Field label="New password" htmlFor="newPassword" error={password.formState.errors.newPassword?.message}>
                <PasswordInput autoComplete="new-password" {...password.register("newPassword")} />
              </Field>
              <Field label="Confirm new password" htmlFor="confirmPassword" error={password.formState.errors.confirmPassword?.message}>
                <PasswordInput autoComplete="new-password" {...password.register("confirmPassword")} />
              </Field>
            </FieldRow>
          </div>
        </SettingsCard>
      </form>

      <SettingsCard title="Where you're signed in" description="Sign out of any device you don't recognize.">
        <ul className="-my-2 divide-y">
          {sessions.map((s) => {
            const device = deviceLabel(s.userAgent);
            const Icon = device.mobile ? Smartphone : Monitor;
            return (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-small font-medium">
                    {device.label}
                    {s.current && <Badge variant="success">This device</Badge>}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {s.ipAddress ?? "Unknown IP"} · Last active {formatInTimeZone(new Date(s.lastSeenAt), timezone, "d MMM, HH:mm")}
                  </p>
                </div>
                {!s.current && (
                  <Button variant="ghost" size="sm" onClick={() => revoke(s.id)}>
                    <LogOut /> Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </SettingsCard>
    </div>
  );
}
