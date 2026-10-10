import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { CATEGORY_LABELS, MessageBubble, TicketStatusBadge } from "@/components/support/ticket-ui";
import { AppError } from "@/server/http/errors";
import { getTicketForStaff } from "@/server/modules/support/tickets";
import { StaffTicketActions } from "./staff-ticket-actions";

export const metadata: Metadata = { title: "Ticket" };

export default async function AdminTicketPage({ params }: PageProps<"/admin/support/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = await getTicketForStaff(id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!t) notFound();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Button variant="ghost" size="sm" asChild className="-ms-2 self-start">
        <Link href="/admin/support">
          <ArrowLeft /> Support
        </Link>
      </Button>
      <PageHeader
        title={`#${t.number} ${t.subject}`}
        eyebrow={<TicketStatusBadge status={t.status} staffView />}
        description={
          <>
            <Link href={`/admin/organizations/${t.organization.id}`} className="font-medium text-primary hover:underline">
              {t.organization.name}
            </Link>{" "}
            · {CATEGORY_LABELS[t.category] ?? t.category} · opened by {t.openedBy} <RelativeTime date={t.createdAt} />
          </>
        }
      />
      <ol className="flex flex-col gap-3" aria-label="Conversation">
        {t.messages.map((m) => (
          <MessageBubble key={m.id} author={m.author} body={m.body} at={<RelativeTime date={m.createdAt} />} mine={m.fromSupport} internal={m.internal} />
        ))}
      </ol>
      <StaffTicketActions id={t.id} status={t.status} priority={t.priority} />
    </div>
  );
}
