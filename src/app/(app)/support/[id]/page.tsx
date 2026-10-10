import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { CATEGORY_LABELS, MessageBubble, TicketStatusBadge } from "@/components/support/ticket-ui";
import { can, requirePageContext } from "@/server/auth/context";
import { AppError } from "@/server/http/errors";
import { getMyTicket } from "@/server/modules/support/tickets";
import { TicketReply } from "./ticket-reply";

export const metadata: Metadata = { title: "Support request" };

export default async function TicketPage({ params }: PageProps<"/support/[id]">) {
  const ctx = await requirePageContext();
  if (!can(ctx, "support.use")) redirect("/forbidden");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = await getMyTicket(ctx, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!t) notFound();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <BreadcrumbLabel segment={id} label={`#${t.number}`} />
      <Button variant="ghost" size="sm" asChild className="-ms-2 self-start">
        <Link href="/support">
          <ArrowLeft className="rtl:rotate-180" /> All requests
        </Link>
      </Button>
      <PageHeader title={t.subject} eyebrow={<TicketStatusBadge status={t.status} />} description={`#${t.number} · ${CATEGORY_LABELS[t.category] ?? t.category}`} />
      <ol className="flex flex-col gap-3" aria-label="Conversation">
        {t.messages.map((m) => (
          <MessageBubble key={m.id} author={m.fromSupport ? `${m.author} (EduAttend)` : m.author} body={m.body} at={<RelativeTime date={m.createdAt} />} mine={!m.fromSupport} />
        ))}
      </ol>
      <TicketReply id={t.id} closed={t.status === "CLOSED"} />
    </div>
  );
}
