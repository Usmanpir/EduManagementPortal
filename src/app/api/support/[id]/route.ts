import { z } from "zod";
import { ok, route, uuidParam } from "@/server/http/api";
import { closeMyTicket, getMyTicket, replyMyTicket } from "@/server/modules/support/tickets";

export const GET = route({ permission: "support.use", allowInactiveSubscription: true }, async ({ ctx, params }) => ok(await getMyTicket(ctx, uuidParam(params, "id"))));

export const POST = route({ permission: "support.use", body: z.object({ body: z.string().trim().min(1, "Write a reply.").max(5000) }), allowInactiveSubscription: true }, async ({ ctx, params, body }) => {
  await replyMyTicket(ctx, uuidParam(params, "id"), body.body);
  return ok(null, "Reply sent.");
});

export const PATCH = route({ permission: "support.use", body: z.object({ close: z.literal(true) }), allowInactiveSubscription: true }, async ({ ctx, params }) => {
  await closeMyTicket(ctx, uuidParam(params, "id"));
  return ok(null, "Ticket closed.");
});
