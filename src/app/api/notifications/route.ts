import { z } from "zod";
import { ok, route } from "@/server/http/api";
import { listNotifications, unreadCount } from "@/server/modules/communication/notifications";

const query = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.uuid().optional(),
  unread: z.enum(["true", "false"]).optional(),
});

export const GET = route({ query }, async ({ ctx, query }) => {
  const [page, unread] = await Promise.all([
    listNotifications(ctx.user.id, { limit: query.limit, cursor: query.cursor, unreadOnly: query.unread === "true" }),
    unreadCount(ctx.user.id),
  ]);
  return ok({ ...page, unread });
});
