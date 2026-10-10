import { z } from "zod";
import { created, ok, route } from "@/server/http/api";
import { createInvoice, listInvoices } from "@/server/modules/finance/invoices";
import { invoiceSchema } from "@/lib/validation/finance";
import { pagination } from "@/lib/validation/common";
import { csvList } from "@/lib/validation/query";

const query = pagination.extend({ status: csvList, classId: csvList, period: z.string().regex(/^\d{4}-\d{2}$/).optional() });

export const GET = route({ permission: "invoices.view", query }, async ({ ctx, query }) => ok(await listInvoices(ctx, query)));

export const POST = route({ permission: "invoices.manage", body: invoiceSchema }, async ({ ctx, body }) => {
  const invoice = await createInvoice(ctx, body);
  return created({ id: invoice.id, invoiceNo: invoice.invoiceNo }, `Invoice ${invoice.invoiceNo} created.`);
});
