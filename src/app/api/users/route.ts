import { z } from "zod";
import { ok, route } from "@/server/http/api";
import { listUsers } from "@/server/modules/users/service";
import { pagination } from "@/lib/validation/common";

const query = pagination.extend({
  role: z.string().optional().transform((v) => v?.split(",").filter(Boolean)),
  status: z.string().optional().transform((v) => v?.split(",").filter(Boolean)),
});

export const GET = route({ permission: "users.view", query }, async ({ ctx, query }) => ok(await listUsers(ctx, query)));
