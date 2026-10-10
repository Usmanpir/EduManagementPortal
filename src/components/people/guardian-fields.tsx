"use client";

import { useEffect, useState } from "react";
import { Controller, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue } from "react-hook-form";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldRow } from "@/components/common/field";
import { OptionSelect } from "@/components/common/option-select";
import { api } from "@/lib/api-client";
import { GUARDIAN_RELATIONS } from "@/lib/validation/people";
import { RELATION_LABELS } from "./types";

type Match = { id: string; name: string; firstName: string; lastName: string; relation: string; phone: string; email: string | null; children: string[] };

/* eslint-disable @typescript-eslint/no-explicit-any -- shared between the student form (prefixed paths) and the guardian form */
type Props = {
  prefix: string;
  register: UseFormRegister<any>;
  /** Typed loosely: react-hook-form's Control is invariant in its field types. */
  control: unknown;
  setValue: UseFormSetValue<any>;
  errors: FieldErrors<any> | undefined;
  showCnic: boolean;
  linkedId: string | null | undefined;
  phone: string | undefined;
  /** Offer to link an existing guardian with the same phone (sibling families). */
  suggestExisting?: boolean;
};

/** Guardian inputs reused by "Add student" and "Add guardian". */
export function GuardianFields({ prefix, register, control, setValue, errors, showCnic, linkedId, phone, suggestExisting = true }: Props) {
  const [matches, setMatches] = useState<Match[]>([]);
  const p = (name: string) => `${prefix}${name}`;
  const err = (name: string) => (errors?.[name] as { message?: string } | undefined)?.message;

  useEffect(() => {
    if (!suggestExisting || linkedId) return;
    const digits = (phone ?? "").replace(/[^\d]/g, "");
    if (digits.length < 10) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      api
        .get<Match[]>(`/api/guardians/lookup?phone=${encodeURIComponent(phone!)}`, { signal: controller.signal })
        .then(({ data }) => setMatches(data))
        .catch(() => undefined);
    }, 350);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [phone, linkedId, suggestExisting]);

  const link = (m: Match) => {
    setValue(p("id"), m.id, { shouldDirty: true });
    setValue(p("firstName"), m.firstName);
    setValue(p("lastName"), m.lastName);
    setValue(p("relation"), m.relation);
    setValue(p("email"), m.email ?? "");
    setMatches([]);
  };

  return (
    <div className="flex flex-col gap-4">
      {linkedId ? (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary-subtle/60 px-3 py-2.5 text-small">
          <Link2 className="size-4 shrink-0 text-primary" />
          <span className="flex-1">Linked to an existing guardian — their details are shared with siblings.</span>
          <Button type="button" variant="ghost" size="xs" onClick={() => setValue(p("id"), null)}>
            <X /> Unlink
          </Button>
        </div>
      ) : (
        matches.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-info/30 bg-info-subtle px-3 py-2.5 text-small text-info-foreground">
            <p className="font-medium">A guardian with this phone number already exists</p>
            {matches.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <span className="flex-1">
                  {m.name} · {RELATION_LABELS[m.relation]} of {m.children.join(", ") || "no students"}
                </span>
                <Button type="button" size="xs" variant="outline" onClick={() => link(m)}>
                  <Link2 /> Link
                </Button>
              </div>
            ))}
          </div>
        )
      )}
      <FieldRow>
        <Field label="Phone" htmlFor={p("phone")} error={err("phone")} hint="Used for attendance and fee alerts." required>
          <Input type="tel" inputMode="tel" placeholder="+92 300 1234567" {...register(p("phone"))} />
        </Field>
        <Field label="Relation" htmlFor={p("relation")}>
          <Controller
            control={control as Control<any>}
            name={p("relation")}
            render={({ field }) => (
              <OptionSelect id={p("relation")} value={field.value} onChange={(v) => field.onChange(v ?? "GUARDIAN")} options={GUARDIAN_RELATIONS.map((r) => ({ value: r, label: RELATION_LABELS[r]! }))} />
            )}
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="First name" htmlFor={p("firstName")} error={err("firstName")} required>
          <Input {...register(p("firstName"))} disabled={!!linkedId} />
        </Field>
        <Field label="Last name" htmlFor={p("lastName")} error={err("lastName")} required>
          <Input {...register(p("lastName"))} disabled={!!linkedId} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Email" htmlFor={p("email")} error={err("email")} hint="Needed for parent portal access.">
          <Input type="email" {...register(p("email"))} disabled={!!linkedId} />
        </Field>
        {showCnic ? (
          <Field label="CNIC" htmlFor={p("cnic")} error={err("cnic")}>
            <Input inputMode="numeric" placeholder="12345-1234567-1" {...register(p("cnic"))} disabled={!!linkedId} />
          </Field>
        ) : (
          <Field label="WhatsApp" htmlFor={p("whatsapp")} error={err("whatsapp")} hint="If different from phone.">
            <Input type="tel" {...register(p("whatsapp"))} disabled={!!linkedId} />
          </Field>
        )}
      </FieldRow>
    </div>
  );
}
