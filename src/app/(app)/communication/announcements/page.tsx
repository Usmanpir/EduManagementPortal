import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can, requirePageContext } from "@/server/auth/context";
import { audienceOptions, listAnnouncements } from "@/server/modules/communication/announcements";
import { pagination } from "@/lib/validation/common";
import { AnnouncementsView } from "./announcements-view";

export const metadata: Metadata = { title: "Announcements" };

const params = pagination.extend({ status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional().catch(undefined), id: z.uuid().optional().catch(undefined) });

export default async function AnnouncementsPage({ searchParams }: PageProps<"/communication/announcements">) {
  const ctx = await requirePageContext();
  if (!can(ctx, "announcements.view")) redirect("/forbidden");
  const canManage = can(ctx, "announcements.manage");
  const query = params.parse(await searchParams);
  const status = canManage ? (query.status ?? "PUBLISHED") : "PUBLISHED";
  const [list, options] = await Promise.all([listAnnouncements(ctx, { status, page: query.page, pageSize: query.pageSize }), canManage ? audienceOptions(ctx) : null]);
  return <AnnouncementsView {...list} status={status} page={query.page} pageSize={query.pageSize} focusId={query.id ?? null} options={options} canManage={canManage} orgName={ctx.organization.name} />;
}
