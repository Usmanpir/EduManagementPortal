import { z } from "zod";
import { ok, route } from "@/server/http/api";
import { previewReach } from "@/server/modules/communication/announcements";
import { EXTERNAL_CHANNELS, audienceSchema } from "@/lib/validation/communication";

const body = audienceSchema.and(z.object({ channels: z.array(z.enum(EXTERNAL_CHANNELS)).default([]) }));

/** Who an announcement would reach, before it's sent. (POST: read-only, but takes a body.) */
export const POST = route({ permission: "announcements.manage", body }, async ({ ctx, body }) => ok(await previewReach(ctx, body, body.channels)));
