import { created, ok, route } from "@/server/http/api";
import { listRooms, saveRoom } from "@/server/modules/academics/service";
import { roomSchema } from "@/lib/validation/academics";

export const GET = route({ permission: "academics.view" }, async ({ ctx }) => ok(await listRooms(ctx)));

export const POST = route({ permission: "academics.manage", body: roomSchema }, async ({ ctx, body }) =>
  created(await saveRoom(ctx, null, body), "Room created."),
);
