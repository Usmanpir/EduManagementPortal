import { z } from "zod";
import { ok, route, uuidParam } from "@/server/http/api";
import { requireSuperAdminApi } from "@/server/auth/platform";
import { markBillingInvoicePaid, voidBillingInvoice } from "@/server/modules/platform/billing";
import { markPaidSchema } from "@/lib/validation/billing";

const body = z.discriminatedUnion("action", [
  markPaidSchema.extend({ action: z.literal("paid") }),
  z.object({ action: z.literal("void"), reason: z.string().trim().min(3, "Give a reason.").max(300) }),
]);

export const POST = route({ auth: false, platform: true, body }, async ({ params, body }) => {
  const session = await requireSuperAdminApi();
  const id = uuidParam(params, "id");
  if (body.action === "paid") {
    await markBillingInvoicePaid(session.user.id, id, body);
    return ok(null, "Payment recorded. The subscription is active.");
  }
  await voidBillingInvoice(session.user.id, id, body.reason);
  return ok(null, "Invoice voided.");
});
