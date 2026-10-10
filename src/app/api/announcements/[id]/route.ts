import { z } from "zod";
import { ok, route, uuidParam } from "@/server/http/api";
import { deleteAnnouncement, saveAnnouncement, updateAnnouncementState } from "@/server/modules/communication/announcements";
import { announcementSchema } from "@/lib/validation/communication";

/** Edit a draft (optionally sending it). */
export const PUT = route({ permission: "announcements.manage", body: announcementSchema }, async ({ ctx, params, body }) => {
  const { sent } = await saveAnnouncement(ctx, uuidParam(params, "id"), body);
  return ok({ sent }, sent ? `Sent to ${sent.people} people.` : "Draft saved.");
});

/** Pin / unpin, archive / restore. */
export const PATCH = route({ permission: "announcements.manage", body: z.object({ isPinned: z.boolean().optional(), archived: z.boolean().optional() }) }, async ({ ctx, params, body }) => {
  await updateAnnouncementState(ctx, uuidParam(params, "id"), body);
  return ok(null, body.archived === true ? "Announcement archived." : body.archived === false ? "Announcement restored." : body.isPinned ? "Pinned to the top." : "Unpinned.");
});

export const DELETE = route({ permission: "announcements.manage" }, async ({ ctx, params }) => {
  await deleteAnnouncement(ctx, uuidParam(params, "id"));
  return ok(null, "Draft deleted.");
});
