import { ok, route, uuidParam } from "@/server/http/api";
import { requireSuperAdminApi } from "@/server/auth/platform";
import { staffReply, staffUpdateTicket } from "@/server/modules/support/tickets";
import { ticketReplySchema, ticketUpdateSchema } from "@/lib/validation/billing";

export const POST = route({ auth: false, platform: true, body: ticketReplySchema }, async ({ params, body }) => {
  const session = await requireSuperAdminApi();
  await staffReply(session.user.id, uuidParam(params, "id"), body);
  return ok(null, body.internal ? "Internal note added." : "Reply sent to the school.");
});

export const PATCH = route({ auth: false, platform: true, body: ticketUpdateSchema }, async ({ params, body }) => {
  const session = await requireSuperAdminApi();
  await staffUpdateTicket(session.user.id, uuidParam(params, "id"), body);
  return ok(null, "Ticket updated.");
});
