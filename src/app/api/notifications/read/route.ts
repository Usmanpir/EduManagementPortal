import { z } from "zod";
import { ok, route } from "@/server/http/api";
import { markRead } from "@/server/modules/communication/notifications";

const body = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(z.uuid()).min(1).max(100) })]);

export const POST = route({ body, allowInactiveSubscription: true }, async ({ ctx, body }) => {
  const count = await markRead(ctx.user.id, "all" in body ? "all" : body.ids);
  return ok({ count }, "Notifications marked as read.");
});
