import { created, ok, route } from "@/server/http/api";
import { listFeeStructures, saveFeeStructure } from "@/server/modules/finance/fees";
import { feeStructureSchema } from "@/lib/validation/finance";

export const GET = route({ permission: "fees.view" }, async ({ ctx }) => ok(await listFeeStructures(ctx)));

export const POST = route({ permission: "fees.manage", body: feeStructureSchema }, async ({ ctx, body }) => created(await saveFeeStructure(ctx, null, body), "Fee created."));
