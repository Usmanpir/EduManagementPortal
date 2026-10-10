import { z } from "zod";
import { created, ok, route } from "@/server/http/api";
import { createTicket, listMyTickets } from "@/server/modules/support/tickets";
import { ticketSchema } from "@/lib/validation/billing";

export const GET = route({ permission: "support.use", query: z.object({ status: z.enum(["open", "closed"]).optional() }), allowInactiveSubscription: true }, async ({ ctx, query }) => ok(await listMyTickets(ctx, query.status)));

export const POST = route({ permission: "support.use", body: ticketSchema, allowInactiveSubscription: true }, async ({ ctx, body }) => {
  const t = await createTicket(ctx, body);
  return created(t, `Ticket #${t.number} opened. We usually reply within one working day.`);
});
