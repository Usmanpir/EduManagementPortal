import { ok, route, uuidParam } from "@/server/http/api";
import { setStudentFee, studentFeePlan } from "@/server/modules/finance/fees";
import { studentFeeSchema } from "@/lib/validation/finance";

export const GET = route({ permission: "fees.view" }, async ({ ctx, params }) => ok(await studentFeePlan(ctx, uuidParam(params, "id"))));

export const PUT = route({ permission: "fees.manage", body: studentFeeSchema }, async ({ ctx, body, params }) => {
  await setStudentFee(ctx, uuidParam(params, "id"), body);
  return ok(null, "Fee plan updated.");
});
