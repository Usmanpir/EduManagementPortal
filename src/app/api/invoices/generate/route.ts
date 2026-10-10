import { ok, route } from "@/server/http/api";
import { generateInvoices } from "@/server/modules/finance/invoices";
import { generateInvoicesSchema } from "@/lib/validation/finance";

export const POST = route({ permission: "invoices.manage", body: generateInvoicesSchema }, async ({ ctx, body }) => {
  const r = await generateInvoices(ctx, body);
  const parts = [`${r.created} invoices created`, r.skipped ? `${r.skipped} already billed` : null, r.empty ? `${r.empty} with no matching fees` : null].filter(Boolean);
  return ok(r, `${parts.join(" · ")}.`);
});
