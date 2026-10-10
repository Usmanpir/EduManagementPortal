import { z } from "zod";
import { created, ok, route } from "@/server/http/api";
import { createLeave, listLeave } from "@/server/modules/attendance/leave";
import { leaveRequestSchema } from "@/lib/validation/attendance";
import { pagination } from "@/lib/validation/common";
import { csvList } from "@/lib/validation/query";

const query = pagination.extend({ status: csvList, requesterType: csvList, mine: z.enum(["1"]).optional() });

export const GET = route({ query }, async ({ ctx, query }) => ok(await listLeave(ctx, { ...query, mine: query.mine === "1" })));

export const POST = route({ permission: "leave.request", body: leaveRequestSchema }, async ({ ctx, body }) => {
  const leave = await createLeave(ctx, body);
  return created({ id: leave.id }, "Leave request submitted.");
});
