"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { OptionSelect } from "@/components/common/option-select";
import { PRIORITY_LABELS, TICKET_STATUS } from "@/components/support/ticket-ui";
import { api, errorMessage } from "@/lib/api-client";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/validation/billing";

export function StaffTicketActions({ id, status, priority }: { id: string; status: string; priority: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);

  const update = async (patch: { status?: string; priority?: string }) => {
    try {
      toast.success((await api.patch(`/api/admin/support/${id}`, patch)).message);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      toast.success((await api.post(`/api/admin/support/${id}`, { body, internal })).message);
      setBody("");
      setInternal(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={send} className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-xs">
        <label htmlFor="staff-reply" className="sr-only">
          Reply
        </label>
        <Textarea id="staff-reply" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? "Internal note — only platform staff see this" : "Reply to the school…"} />
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-small">
            <Checkbox checked={internal} onCheckedChange={(v) => setInternal(v === true)} /> Internal note
          </label>
          <Button type="submit" loading={busy} disabled={!body.trim()}>
            <Send /> {internal ? "Add note" : "Send reply"}
          </Button>
        </div>
      </form>
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-small">
          Status
          <span className="w-52">
            <OptionSelect ariaLabel="Status" value={status} onChange={(v) => v && update({ status: v })} options={TICKET_STATUSES.map((s) => ({ value: s, label: s === "WAITING_ON_CUSTOMER" ? "Waiting on school" : TICKET_STATUS[s]!.label }))} />
          </span>
        </label>
        <label className="flex items-center gap-2 text-small">
          Priority
          <span className="w-36">
            <OptionSelect ariaLabel="Priority" value={priority} onChange={(v) => v && update({ priority: v })} options={TICKET_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p]! }))} />
          </span>
        </label>
      </div>
    </div>
  );
}
