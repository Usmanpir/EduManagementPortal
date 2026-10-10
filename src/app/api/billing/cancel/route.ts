import { ok, route } from "@/server/http/api";
import { setCancelAtPeriodEnd } from "@/server/modules/billing/account";
import { cancelSchema } from "@/lib/validation/billing";

export const POST = route({ permission: "billing.manage", body: cancelSchema, allowInactiveSubscription: true }, async ({ ctx, body }) => {
  await setCancelAtPeriodEnd(ctx, body);
  return ok(null, body.cancel ? "Your subscription will end at the close of the current period." : "Cancellation withdrawn. Your subscription continues.");
});
