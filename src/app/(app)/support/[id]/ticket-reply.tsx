"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api-client";

export function TicketReply({ id, closed }: { id: string; closed: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  if (closed) return <p className="rounded-xl border bg-muted/40 p-4 text-small text-muted-foreground">This request is closed. Open a new one if you still need help.</p>;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      toast.success((await api.post(`/api/support/${id}`, { body })).message);
      setBody("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const close = async () => {
    try {
      toast.success((await api.patch(`/api/support/${id}`, { close: true })).message);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <form onSubmit={send} className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-xs">
      <label htmlFor="reply" className="sr-only">
        Reply
      </label>
      <Textarea id="reply" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" />
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={close}>
          Mark as solved
        </Button>
        <Button type="submit" loading={busy} disabled={!body.trim()}>
          <Send /> Send
        </Button>
      </div>
    </form>
  );
}
