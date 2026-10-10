import { created, ok, route } from "@/server/http/api";
import { listPayments, recordPayment } from "@/server/modules/finance/payments";
import { paymentSchema } from "@/lib/validation/finance";
import { isoDate, pagination } from "@/lib/validation/common";
import { csvList } from "@/lib/validation/query";

const query = pagination.extend({ method: csvList, from: isoDate.optional(), to: isoDate.optional() });

export const GET = route({ permission: "payments.view", query }, async ({ ctx, query }) => ok(await listPayments(ctx, query)));

export const POST = route({ permission: "payments.record", body: paymentSchema }, async ({ ctx, body }) => {
  const { payment, duplicate } = await recordPayment(ctx, body);
  return created({ id: payment.id, receiptNo: payment.receiptNo, invoiceId: payment.invoiceId, duplicate }, duplicate ? "This payment was already recorded." : `Payment recorded. Receipt ${payment.receiptNo}.`);
});
