import { created, route } from "@/server/http/api";
import { requestPlanChange } from "@/server/modules/billing/account";
import { planChangeRequestSchema } from "@/lib/validation/billing";

/** Works while suspended, which is exactly when schools need it. */
export const POST = route({ permission: "billing.manage", body: planChangeRequestSchema, allowInactiveSubscription: true }, async ({ ctx, body }) => {
  const { ticket, over } = await requestPlanChange(ctx, body);
  return created({ ...ticket, over }, `Request #${ticket.number} sent. Our team will confirm and send you an invoice.`);
});
