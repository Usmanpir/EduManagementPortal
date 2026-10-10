"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, Building, Ellipsis, GraduationCap, IdCard, Library, MapPin, Pencil, Phone, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { api, applyFieldErrors, errorMessage } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { campusSchema } from "@/lib/validation/organization";

type Campus = {
  id: string;
  name: string;
  code: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  isMain: boolean;
  students: number;
  staff: number;
  classes: number;
};

type Values = z.input<typeof campusSchema>;
const EMPTY: Values = { name: "", code: "", city: "", address: "", phone: "", email: "" };

function useCampusForm({ campus, onDone }: { campus: Campus | null; onDone: () => void }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(campusSchema),
    defaultValues: campus
      ? { name: campus.name, code: campus.code, city: campus.city ?? "", address: campus.address ?? "", phone: campus.phone ?? "", email: campus.email ?? "" }
      : EMPTY,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { message } = campus ? await api.patch(`/api/campuses/${campus.id}`, values) : await api.post("/api/campuses", values);
      toast.success(message);
      onDone();
      router.refresh();
    } catch (error) {
      if (!applyFieldErrors(error, setError)) setFormError(errorMessage(error));
    }
  });

  return { isSubmitting, body: (
    <form id="campus-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormAlert>{formError}</FormAlert>
      <FieldRow>
        <Field label="Campus name" htmlFor="name" error={errors.name?.message} required>
          <Input autoFocus placeholder="e.g. Islamabad Campus" {...register("name")} />
        </Field>
        <Field label="Short code" htmlFor="code" error={errors.code?.message} hint="Used in IDs and reports, e.g. ISB." required>
          <Input className="uppercase" maxLength={10} {...register("code")} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="City" htmlFor="city" error={errors.city?.message}>
          <Input {...register("city")} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
          <Input type="tel" {...register("phone")} />
        </Field>
      </FieldRow>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input type="email" {...register("email")} />
      </Field>
      <Field label="Address" htmlFor="address" error={errors.address?.message}>
        <Textarea rows={3} {...register("address")} />
      </Field>
    </form>
  ) };
}

function CampusDrawer({ open, onOpenChange, campus }: { open: boolean; onOpenChange: (o: boolean) => void; campus: Campus | null }) {
  const form = useCampusForm({ campus, onDone: () => onOpenChange(false) });
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={campus ? `Edit ${campus.name}` : "Add campus"}
      description={campus ? undefined : "Each campus has its own classes, staff and students."}
      formId="campus-form"
      submitLabel={campus ? "Save changes" : "Add campus"}
      submitting={form.isSubmitting}
    >
      {form.body}
    </FormDrawer>
  );
}

export function CampusesView({ campuses, canManage, limit, planName }: { campuses: Campus[]; canManage: boolean; limit: number | null; planName: string | null }) {
  const router = useRouter();
  const [drawer, setDrawer] = useState<{ open: boolean; campus: Campus | null; key: number }>({ open: false, campus: null, key: 0 });
  const [archiving, setArchiving] = useState<Campus | null>(null);
  const atLimit = limit !== null && campuses.length >= limit;

  const openDrawer = (campus: Campus | null) => setDrawer((d) => ({ open: true, campus, key: d.key + 1 }));

  const setMain = async (campus: Campus) => {
    try {
      const { message } = await api.post(`/api/campuses/${campus.id}`, { action: "set-main" });
      toast.success(message);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-h2">Campuses</h2>
          <p className="text-small text-muted-foreground">
            {limit === null ? `${campuses.length} campuses` : `${campuses.length} of ${limit} campuses on your ${planName} plan`}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => openDrawer(null)} disabled={atLimit} title={atLimit ? "Upgrade your plan to add more campuses" : undefined}>
            <Plus /> Add campus
          </Button>
        )}
      </div>

      {campuses.length === 0 ? (
        <EmptyState
          icon={Building}
          title="No campuses yet"
          description="Add your first campus to start organizing classes and students."
          actions={canManage && <Button onClick={() => openDrawer(null)}><Plus /> Add campus</Button>}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {campuses.map((c) => (
            <li key={c.id} className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary-subtle-foreground">
                  <Building className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-h3">{c.name}</h3>
                    <Badge variant="outline" className="font-mono">{c.code}</Badge>
                    {c.isMain && <Badge variant="primary">Main campus</Badge>}
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5 text-small text-muted-foreground">
                    {(c.city || c.address) && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="size-3.5 shrink-0" /> {[c.address, c.city].filter(Boolean).join(", ")}
                      </span>
                    )}
                    {c.phone && (
                      <span className="flex items-center gap-1.5">
                        <Phone className="size-3.5 shrink-0" /> {c.phone}
                      </span>
                    )}
                  </div>
                </div>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.name}`}>
                        <Ellipsis />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openDrawer(c)}>
                        <Pencil /> Edit details
                      </DropdownMenuItem>
                      {!c.isMain && (
                        <DropdownMenuItem onSelect={() => setMain(c)}>
                          <Star /> Make main campus
                        </DropdownMenuItem>
                      )}
                      {!c.isMain && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setArchiving(c)}>
                            <Archive /> Archive campus
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <dl className="grid grid-cols-3 divide-x rounded-lg border bg-muted/30 rtl:divide-x-reverse">
                {[
                  { label: "Students", value: c.students, icon: GraduationCap },
                  { label: "Staff", value: c.staff, icon: IdCard },
                  { label: "Classes", value: c.classes, icon: Library },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col gap-0.5 px-3 py-2.5">
                    <dt className="flex items-center gap-1.5 text-caption text-muted-foreground">
                      <s.icon className="size-3.5" /> {s.label}
                    </dt>
                    <dd className="tabular text-h3">{formatNumber(s.value)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}

      {atLimit && canManage && (
        <p className="text-small text-muted-foreground">
          You&apos;ve reached the campus limit for your plan. <a href="/settings/billing" className="font-medium text-primary hover:underline">Upgrade</a> to add more.
        </p>
      )}

      <CampusDrawer key={drawer.key} open={drawer.open} onOpenChange={(open) => setDrawer((d) => ({ ...d, open }))} campus={drawer.campus} />

      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        tone="danger"
        title={`Archive ${archiving?.name ?? "campus"}?`}
        description="The campus will be hidden from day-to-day use. Its history — attendance, fees and results — is kept. Users limited to this campus lose access to it."
        confirmLabel="Archive campus"
        onConfirm={async () => {
          if (!archiving) return;
          try {
            const { message } = await api.delete(`/api/campuses/${archiving.id}`);
            toast.success(message);
            router.refresh();
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </div>
  );
}
