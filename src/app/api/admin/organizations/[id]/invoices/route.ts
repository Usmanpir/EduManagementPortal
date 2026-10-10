import { created, route, uuidParam } from "@/server/http/api";
import { requireSuperAdminApi } from "@/server/auth/platform";
import { createBillingInvoice } from "@/server/modules/platform/billing";
import { billingInvoiceSchema } from "@/lib/validation/billing";

export const POST = route({ auth: false, platform: true, body: billingInvoiceSchema }, async ({ params, body }) => {
  const session = await requireSuperAdminApi();
  const inv = await createBillingInvoice(session.user.id, uuidParam(params, "id"), body);
  return created({ id: inv.id, number: inv.number }, `Invoice ${inv.number} issued.`);
});
