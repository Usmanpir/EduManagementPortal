import { ok, route, uuidParam } from "@/server/http/api";
import { archiveDocument } from "@/server/modules/documents/service";

export const DELETE = route({ permission: "documents.manage" }, async ({ ctx, params }) => {
  await archiveDocument(ctx, uuidParam(params, "id"));
  return ok(null, "Document removed.");
});
