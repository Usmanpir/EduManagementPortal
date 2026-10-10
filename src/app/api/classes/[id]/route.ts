import { ok, route, uuidParam } from "@/server/http/api";
import { notFound } from "@/server/http/errors";
import { archiveClass, getClass, updateClass } from "@/server/modules/academics/service";
import { classSchema } from "@/lib/validation/academics";

export const GET = route({ permission: "academics.view" }, async ({ ctx, params }) => {
  const cls = await getClass(ctx, uuidParam(params, "id"));
  if (!cls) throw notFound("Class");
  return ok(cls);
});

export const PATCH = route({ permission: "academics.manage", body: classSchema }, async ({ ctx, body, params }) =>
  ok(await updateClass(ctx, uuidParam(params, "id"), body), "Class updated."),
);

export const DELETE = route({ permission: "academics.manage" }, async ({ ctx, params }) => {
  await archiveClass(ctx, uuidParam(params, "id"));
  return ok(null, "Class archived.");
});
