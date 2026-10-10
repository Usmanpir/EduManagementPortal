import { ok, route } from "@/server/http/api";
import { listDeliveries, retryFailed } from "@/server/modules/communication/integrations";
import { pagination } from "@/lib/validation/common";
import { csvList } from "@/lib/validation/query";

const query = pagination.extend({ status: csvList, channel: csvList });

export const GET = route({ permission: "settings.manage", query }, async ({ ctx, query }) => ok(await listDeliveries(ctx, query)));

export const POST = route({ permission: "settings.manage" }, async ({ ctx }) => {
  const n = await retryFailed(ctx);
  return ok({ count: n }, n ? `${n} failed messages will be retried.` : "Nothing to retry.");
});
