import { ok, route } from "@/server/http/api";
import { billingOverview } from "@/server/modules/billing/account";

export const GET = route({ permission: "billing.view", allowInactiveSubscription: true }, async ({ ctx }) => ok(await billingOverview(ctx)));
