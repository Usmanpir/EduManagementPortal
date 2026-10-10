import { ok, route, uuidParam } from "@/server/http/api";
import { reviewCorrection } from "@/server/modules/attendance/register";
import { reviewSchema } from "@/lib/validation/attendance";

export const POST = route({ permission: "attendance.edit", body: reviewSchema }, async ({ ctx, body, params }) => {
  await reviewCorrection(ctx, uuidParam(params, "id"), body.decision);
  return ok(null, body.decision === "APPROVED" ? "Correction approved and applied." : "Correction rejected.");
});
