import { ok, route, uuidParam } from "@/server/http/api";
import { deleteFeeStructure, saveFeeStructure } from "@/server/modules/finance/fees";
import { feeStructureSchema } from "@/lib/validation/finance";

export const PATCH = route({ permission: "fees.manage", body: feeStructureSchema }, async ({ ctx, body, params }) => ok(await saveFeeStructure(ctx, uuidParam(params, "id"), body), "Fee updated."));

export const DELETE = route({ permission: "fees.manage" }, async ({ ctx, params }) => {
  const result = await deleteFeeStructure(ctx, uuidParam(params, "id"));
  return ok({ result }, result === "deleted" ? "Fee deleted." : "Fee switched off. It stays on past invoices.");
});
