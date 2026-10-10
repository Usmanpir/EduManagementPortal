import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DocumentCategory } from "@/generated/prisma/enums";
import { can, requirePageContext } from "@/server/auth/context";
import { listDocuments } from "@/server/modules/documents/service";
import { DocumentsView } from "./documents-view";

export const metadata: Metadata = { title: "Documents" };

const params = z.object({
  scope: z.enum(["library", "all"]).catch("library"),
  category: z.enum(Object.values(DocumentCategory) as [DocumentCategory, ...DocumentCategory[]]).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});

export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const ctx = await requirePageContext();
  if (!can(ctx, "documents.view")) redirect("/forbidden");
  const canSeeAll = can(ctx, "records.all", "students.view", "staff.view");
  const p = params.parse(await searchParams);
  const scope = canSeeAll ? p.scope : "library";
  const pageSize = 30;
  const list = await listDocuments(ctx, { entityType: null, entityId: null, scope, category: p.category ? [p.category] : undefined, q: p.q, page: p.page, pageSize });
  return <DocumentsView {...list} scope={scope} page={p.page} pageSize={pageSize} canSeeAll={canSeeAll} canManage={can(ctx, "documents.manage")} hasFilters={!!(p.q || p.category)} />;
}
