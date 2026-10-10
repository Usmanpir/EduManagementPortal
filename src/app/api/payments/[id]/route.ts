import { ok, route, uuidParam } from "@/server/http/api";
import { voidPayment } from "@/server/modules/finance/payments";
import { voidPaymentSchema } from "@/lib/validation/finance";

export const DELETE = route({ permission: "payments.void", body: voidPaymentSchema }, async ({ ctx, params, body }) => {
  await voidPayment(ctx, uuidParam(params, "id"), body.reason);
  return ok(null, "Payment voided. The invoice balance was updated.");
});
