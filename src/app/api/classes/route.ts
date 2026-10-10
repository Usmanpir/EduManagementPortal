import { z } from "zod";
import { created, ok, route } from "@/server/http/api";
import { createClass, listClasses } from "@/server/modules/academics/service";
import { classSchema } from "@/lib/validation/academics";

export const GET = route({ permission: "academics.view", query: z.object({ q: z.string().max(100).optional() }) }, async ({ ctx, query }) =>
  ok(await listClasses(ctx, query)),
);

export const POST = route({ permission: "academics.manage", body: classSchema }, async ({ ctx, body }) =>
  created(await createClass(ctx, body), "Class created."),
);
