import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can, requirePageContext } from "@/server/auth/context";
import { listMyTickets } from "@/server/modules/support/tickets";
import { SupportView } from "./support-view";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage({ searchParams }: PageProps<"/support">) {
  const ctx = await requirePageContext();
  if (!can(ctx, "support.use")) redirect("/forbidden");
  const sp = await searchParams;
  const status = sp.status === "closed" ? "closed" : "open";
  const tickets = await listMyTickets(ctx, status);
  return <SupportView tickets={tickets} status={status} openNew={sp.new === "1"} defaultCategory={typeof sp.category === "string" ? sp.category : "general"} />;
}
