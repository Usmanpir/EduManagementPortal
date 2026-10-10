import { z } from "zod";
import { canAny } from "@/server/auth/context";
import { created, ok, route } from "@/server/http/api";
import { forbidden } from "@/server/http/errors";
import { listCorrections, requestCorrections } from "@/server/modules/attendance/register";
import { correctionRequestSchema } from "@/lib/validation/attendance";

export const GET = route({ query: z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING") }) }, async ({ ctx, query }) => {
  if (!canAny(ctx, "attendance.edit", "attendance.mark")) throw forbidden();
  return ok(await listCorrections(ctx, query.status));
});

export const POST = route({ permission: "attendance.mark", body: correctionRequestSchema }, async ({ ctx, body }) => {
  const count = await requestCorrections(ctx, body);
  return created({ count }, `Correction request sent for ${count} ${count === 1 ? "student" : "students"}.`);
});
