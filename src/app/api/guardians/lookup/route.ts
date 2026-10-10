import { z } from "zod";
import { ok, route } from "@/server/http/api";
import { findGuardiansByPhone } from "@/server/modules/people/students";

/** Finds existing guardians by phone so siblings share one parent record. */
export const GET = route({ permission: "students.view", query: z.object({ phone: z.string().min(7).max(20) }) }, async ({ ctx, query }) =>
  ok(await findGuardiansByPhone(ctx, query.phone)),
);
