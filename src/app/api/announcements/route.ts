import { z } from "zod";
import { created, ok, route } from "@/server/http/api";
import { listAnnouncements, saveAnnouncement } from "@/server/modules/communication/announcements";
import { announcementSchema } from "@/lib/validation/communication";
import { pagination } from "@/lib/validation/common";

const query = pagination.extend({ status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional() });

export const GET = route({ permission: "announcements.view", query }, async ({ ctx, query }) =>
  ok(await listAnnouncements(ctx, { status: query.status === "PUBLISHED" || ctx.permissions.has("announcements.manage") ? query.status : undefined, page: query.page, pageSize: query.pageSize })),
);

export const POST = route({ permission: "announcements.manage", body: announcementSchema }, async ({ ctx, body }) => {
  const { announcement, sent } = await saveAnnouncement(ctx, null, body);
  return created({ id: announcement.id, sent }, sent ? `Sent to ${sent.people} people.` : "Draft saved.");
});
