import { ok, route, uuidParam } from "@/server/http/api";
import { publishAnnouncement } from "@/server/modules/communication/announcements";

export const POST = route({ permission: "announcements.manage" }, async ({ ctx, params }) => {
  const sent = await publishAnnouncement(ctx, uuidParam(params, "id"));
  return ok(sent, `Sent to ${sent.people} people.`);
});
