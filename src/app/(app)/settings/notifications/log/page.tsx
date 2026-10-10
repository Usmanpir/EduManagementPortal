import type { Metadata } from "next";
import { requirePageContext } from "@/server/auth/context";
import { listDeliveries } from "@/server/modules/communication/integrations";
import { pagination } from "@/lib/validation/common";
import { csvList } from "@/lib/validation/query";
import { DeliveryLog } from "./delivery-log";

export const metadata: Metadata = { title: "Delivery log" };

const params = pagination.extend({ status: csvList, channel: csvList });

export default async function DeliveryLogPage({ searchParams }: PageProps<"/settings/notifications/log">) {
  const ctx = await requirePageContext("settings.manage");
  const query = params.parse(await searchParams);
  const data = await listDeliveries(ctx, query);
  return <DeliveryLog {...data} page={query.page} pageSize={query.pageSize} timezone={ctx.organization.timezone} />;
}
