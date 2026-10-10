"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller } from "react-hook-form";
import { ChevronRight, LifeBuoy, MessageSquare, Plus } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/empty-state";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { PageHeader } from "@/components/common/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { useApiForm } from "@/components/common/use-api-form";
import { useUrlState } from "@/components/data/use-url-state";
import { CATEGORY_LABELS, PRIORITY_LABELS, TicketStatusBadge } from "@/components/support/ticket-ui";
import { api } from "@/lib/api-client";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, ticketSchema } from "@/lib/validation/billing";

type Ticket = { id: string; number: number; subject: string; category: string; priority: string; status: string; messages: number; updatedAt: string };

function NewTicketDrawer({ onOpenChange, defaultCategory }: { onOpenChange: (o: boolean) => void; defaultCategory: string }) {
  const router = useRouter();
  const category = (TICKET_CATEGORIES as readonly string[]).includes(defaultCategory) ? (defaultCategory as (typeof TICKET_CATEGORIES)[number]) : "general";
  const { form, onSubmit, formError, submitting } = useApiForm({
    schema: ticketSchema,
    defaultValues: { subject: "", category, priority: "MEDIUM", body: "" },
    submit: async (v) => {
      const res = await api.post<{ id: string }>("/api/support", v);
      router.push(`/support/${res.data.id}`);
      return res;
    },
    onSuccess: () => onOpenChange(false),
    refresh: false,
  });
  const { register, control, formState: { errors } } = form;
  return (
    <FormDrawer open onOpenChange={onOpenChange} title="Contact support" description="The EduAttend team will reply here and notify you." formId="ticket-form" submitLabel="Send" submitting={submitting}>
      <form id="ticket-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormAlert>{formError}</FormAlert>
        <Field label="Subject" htmlFor="subject" error={errors.subject?.message} required>
          <Input placeholder="e.g. Can't import students from Excel" {...register("subject")} />
        </Field>
        <FieldRow>
          <Field label="Topic" htmlFor="category">
            <Controller control={control} name="category" render={({ field }) => <OptionSelect id="category" value={field.value} onChange={(v) => field.onChange(v ?? "general")} options={TICKET_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c]! }))} />} />
          </Field>
          <Field label="Priority" htmlFor="priority" hint="Urgent = the school can't work.">
            <Controller control={control} name="priority" render={({ field }) => <OptionSelect id="priority" value={field.value} onChange={(v) => field.onChange(v ?? "MEDIUM")} options={TICKET_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p]! }))} />} />
          </Field>
        </FieldRow>
        <Field label="Message" htmlFor="body" error={errors.body?.message} hint="What were you trying to do, and what happened instead?" required>
          <Textarea rows={7} {...register("body")} />
        </Field>
      </form>
    </FormDrawer>
  );
}

export function SupportView({ tickets, status, openNew, defaultCategory }: { tickets: Ticket[]; status: "open" | "closed"; openNew: boolean; defaultCategory: string }) {
  const { set } = useUrlState();
  const [drawer, setDrawer] = useState(openNew);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader title="Support" description="Questions, problems or ideas — talk to the EduAttend team." actions={<Button onClick={() => setDrawer(true)}><Plus /> New request</Button>} />
      <div role="tablist" aria-label="Status" className="flex gap-1 self-start rounded-lg bg-muted p-1">
        {(["open", "closed"] as const).map((s) => (
          <button key={s} role="tab" type="button" aria-selected={status === s} onClick={() => set({ status: s === "open" ? null : s })} className={cn("rounded-md px-3 py-1 text-small font-medium", status === s ? "bg-card shadow-xs" : "text-muted-foreground")}>
            {s === "open" ? "Open" : "Resolved & closed"}
          </button>
        ))}
      </div>
      {tickets.length === 0 ? (
        <EmptyState icon={LifeBuoy} title={status === "open" ? "No open requests" : "Nothing here yet"} description="If something isn't working or you need a hand, send us a message." actions={<Button variant="outline" onClick={() => setDrawer(true)}><Plus /> New request</Button>} />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/support/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                <span className="w-12 shrink-0 text-caption tabular text-muted-foreground">#{t.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.subject}</span>
                  <span className="flex items-center gap-2 text-caption text-muted-foreground">
                    {CATEGORY_LABELS[t.category] ?? t.category} · <MessageSquare className="size-3" aria-hidden /> {t.messages} · updated <RelativeTime date={t.updatedAt} />
                  </span>
                </span>
                <TicketStatusBadge status={t.status} />
                <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {drawer && <NewTicketDrawer onOpenChange={setDrawer} defaultCategory={defaultCategory} />}
    </div>
  );
}
