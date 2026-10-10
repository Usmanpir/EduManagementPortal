"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { api, ApiError, errorMessage } from "@/lib/api-client";

type Role = { id: string; key: string; name: string; description: string | null; isSystem: boolean; users: number; permissions: string[] };
type Group = { module: string; permissions: { key: string; label: string; description?: string }[] };

export function RoleEditor({ role, groups, held, canManage }: { role: Role | null; groups: Group[]; held: string[]; canManage: boolean }) {
  const router = useRouter();
  const heldSet = useMemo(() => new Set(held), [held]);
  const locked = role?.key === "admin";
  const editable = canManage && !locked;
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? ["dashboard.view"]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const toggle = (key: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const toggleGroup = (group: Group, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of group.permissions) {
        if (!heldSet.has(p.key)) continue;
        if (on) next.add(p.key);
        else next.delete(p.key);
      }
      return next;
    });

  const save = async () => {
    setError(null);
    setNameError(null);
    if (!name.trim()) {
      setNameError("Role name is required.");
      return;
    }
    setSaving(true);
    try {
      const body = { name, description, permissions: [...selected] };
      if (role) {
        const { message } = await api.patch(`/api/roles/${role.id}`, body);
        toast.success(message);
        router.refresh();
      } else {
        const { message } = await api.post<{ id: string }>("/api/roles", body);
        toast.success(message);
        router.push("/settings/roles");
      }
    } catch (e) {
      if (e instanceof ApiError && e.fields?.name) setNameError(e.fields.name);
      else setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {role && <BreadcrumbLabel segment={role.id} label={role.name} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/settings/roles" aria-label="Back to roles">
              <ArrowLeft className="rtl:rotate-180" />
            </Link>
          </Button>
          <div>
            <h2 className="flex items-center gap-2 text-h2">
              {role ? role.name : "New role"}
              {role?.isSystem && <Badge variant="secondary">Built-in</Badge>}
            </h2>
            <p className="text-small text-muted-foreground">
              {locked
                ? "Administrators always have full access so your organization can never be locked out."
                : role
                  ? `${role.users} ${role.users === 1 ? "person has" : "people have"} this role. Changes apply immediately.`
                  : "Pick exactly what this role can see and do."}
            </p>
          </div>
        </div>
        {editable && (
          <div className="flex gap-2">
            {role && !role.isSystem && (
              <Button variant="outline" onClick={() => setDeleting(true)}>
                <Trash2 /> Delete
              </Button>
            )}
            <Button onClick={save} loading={saving}>
              {role ? "Save changes" : "Create role"}
            </Button>
          </div>
        )}
      </div>

      <FormAlert>{error}</FormAlert>

      {!role?.isSystem && editable && (
        <div className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-5 shadow-xs sm:grid-cols-2">
          <Field label="Role name" htmlFor="role-name" error={nameError ?? undefined} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Exam coordinator" />
          </Field>
          <Field label="Description" htmlFor="role-description">
            <Textarea rows={1} value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-9" />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {groups.map((group) => {
          const grantable = group.permissions.filter((p) => heldSet.has(p.key));
          const allOn = grantable.length > 0 && grantable.every((p) => selected.has(p.key));
          const someOn = grantable.some((p) => selected.has(p.key));
          return (
            <section key={group.module} className="rounded-xl border bg-card shadow-xs">
              <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <h3 className="text-h3">{group.module}</h3>
                {editable && grantable.length > 1 && (
                  <label className="flex items-center gap-2 text-small text-muted-foreground">
                    All
                    <Switch checked={allOn} onCheckedChange={(on) => toggleGroup(group, on)} aria-label={`Toggle all ${group.module} permissions`} data-partial={someOn && !allOn} />
                  </label>
                )}
              </header>
              <ul className="divide-y">
                {group.permissions.map((p) => {
                  const canGrant = heldSet.has(p.key);
                  const checked = locked || selected.has(p.key);
                  const inputId = `perm-${p.key}`;
                  return (
                    <li key={p.key} className={cn("flex items-start gap-3 px-4 py-2.5", !canGrant && editable && "opacity-60")}>
                      <Checkbox
                        id={inputId}
                        checked={checked}
                        disabled={!editable || !canGrant}
                        onCheckedChange={(v) => toggle(p.key, v === true)}
                        className="mt-0.5"
                      />
                      <label htmlFor={inputId} className="flex min-w-0 flex-1 flex-col">
                        <span className="text-small font-medium">{p.label}</span>
                        {p.description && <span className="text-caption text-muted-foreground">{p.description}</span>}
                        {!canGrant && editable && (
                          <span className="flex items-center gap-1 text-caption text-muted-foreground">
                            <Lock className="size-3" /> You don&apos;t have this permission
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {role && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          tone="danger"
          title={`Delete the ${role.name} role?`}
          description={role.users > 0 ? `${role.users} people still have this role — reassign them first.` : "This can't be undone."}
          confirmLabel="Delete role"
          onConfirm={async () => {
            try {
              const { message } = await api.delete(`/api/roles/${role.id}`);
              toast.success(message);
              router.push("/settings/roles");
            } catch (e) {
              toast.error(errorMessage(e));
              throw e;
            }
          }}
        />
      )}
    </div>
  );
}
