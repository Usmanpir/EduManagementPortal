import { ok, route, uuidParam } from "@/server/http/api";
import { cancelLeave, reviewLeave } from "@/server/modules/attendance/leave";
import { reviewSchema } from "@/lib/validation/attendance";

export const POST = route({ permission: "leave.review", body: reviewSchema }, async ({ ctx, body, params }) => {
  await reviewLeave(ctx, uuidParam(params, "id"), body.decision, body.note);
  return ok(null, body.decision === "APPROVED" ? "Leave approved." : "Leave rejected.");
});

export const DELETE = route({}, async ({ ctx, params }) => {
  await cancelLeave(ctx, uuidParam(params, "id"));
  return ok(null, "Leave request cancelled.");
});
