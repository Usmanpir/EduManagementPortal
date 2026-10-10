import { ok, route, uuidParam } from "@/server/http/api";
import { archiveRoom, saveRoom } from "@/server/modules/academics/service";
import { roomSchema } from "@/lib/validation/academics";

export const PATCH = route({ permission: "academics.manage", body: roomSchema }, async ({ ctx, body, params }) =>
  ok(await saveRoom(ctx, uuidParam(params, "id"), body), "Room updated."),
);

export const DELETE = route({ permission: "academics.manage" }, async ({ ctx, params }) => {
  await archiveRoom(ctx, uuidParam(params, "id"));
  return ok(null, "Room archived.");
});
