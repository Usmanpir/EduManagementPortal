import { ok, route, uuidParam } from "@/server/http/api";
import { archiveSection, updateSection } from "@/server/modules/academics/service";
import { sectionSchema } from "@/lib/validation/academics";

export const PATCH = route({ permission: "academics.manage", body: sectionSchema }, async ({ ctx, body, params }) =>
  ok(await updateSection(ctx, uuidParam(params, "id"), body), "Section updated."),
);

export const DELETE = route({ permission: "academics.manage" }, async ({ ctx, params }) => {
  await archiveSection(ctx, uuidParam(params, "id"));
  return ok(null, "Section archived.");
});
