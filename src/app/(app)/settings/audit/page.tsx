import type { Metadata } from "next";
import { z } from "zod";
import { requirePageContext } from "@/server/auth/context";
import { auditEntityTypes, listAuditLogs } from "@/server/modules/audit/service";
import { pagination } from "@/lib/validation/common";
import { AuditView } from "./audit-view";

export const metadata: Metadata = { title: "Audit log" };

const params = pagination.extend({ entity: z.string().optional().transform((v) => v?.split(",").filter(Boolean)) });

export default async function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  const ctx = await requirePageContext("audit.view");
  const query = params.parse(await searchParams);
  const [logs, entities] = await Promise.all([listAuditLogs(ctx, { ...query, pageSize: Math.min(query.pageSize, 50) }), auditEntityTypes(ctx)]);
  return <AuditView rows={logs.rows} total={logs.total} page={query.page} pageSize={Math.min(query.pageSize, 50)} entities={entities} timezone={ctx.organization.timezone} />;
}
