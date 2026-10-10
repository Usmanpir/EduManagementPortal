import { z } from "zod";
import { ok, route, uuidParam } from "@/server/http/api";
import { notFound } from "@/server/http/errors";
import { cancelInvoice, getInvoice } from "@/server/modules/finance/invoices";

export const GET = route({ permission: "invoices.view" }, async ({ ctx, params }) => {
  const invoice = await getInvoice(ctx, uuidParam(params, "id"));
  if (!invoice) throw notFound("Invoice");
  return ok(invoice);
});

export const DELETE = route({ permission: "invoices.manage", body: z.object({ reason: z.string().trim().min(3, "Give a reason.").max(200) }) }, async ({ ctx, params, body }) => {
  await cancelInvoice(ctx, uuidParam(params, "id"), body.reason);
  return ok(null, "Invoice cancelled.");
});
