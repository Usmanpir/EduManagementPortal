import { z } from "zod";
import { DocumentCategory } from "@/generated/prisma/enums";
import { clientIp, created, ok, route } from "@/server/http/api";
import { badRequest } from "@/server/http/errors";
import { listDocuments, uploadDocument } from "@/server/modules/documents/service";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { csvList } from "@/lib/validation/query";

const CATEGORIES = Object.values(DocumentCategory) as [DocumentCategory, ...DocumentCategory[]];
const entity = { entityType: z.enum(["student", "staff"]).optional(), entityId: z.uuid().optional() };

export const GET = route(
  {
    permission: "documents.view",
    query: z.object({ ...entity, scope: z.enum(["library", "all"]).optional(), category: csvList, q: z.string().max(100).optional(), page: z.coerce.number().int().min(1).default(1) }),
  },
  async ({ ctx, query }) =>
    ok(
      await listDocuments(ctx, {
        entityType: query.entityType ?? null,
        entityId: query.entityId ?? null,
        scope: query.scope,
        category: query.category?.filter((c): c is DocumentCategory => (CATEGORIES as string[]).includes(c)),
        q: query.q,
        page: query.page,
      }),
    ),
);

const meta = z.object({
  title: z.string().trim().max(160).default(""),
  category: z.enum(CATEGORIES),
  ...entity,
});

export const POST = route(
  { permission: "documents.manage", rateLimit: { key: (req) => `upload:${clientIp(req)}`, rule: RATE_LIMITS.upload } },
  async ({ ctx, req }) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw badRequest("Choose a file to upload.");
    const fields = meta.parse(Object.fromEntries([...(form?.entries() ?? [])].filter(([k]) => k !== "file")));
    if ((fields.entityType && !fields.entityId) || (!fields.entityType && fields.entityId)) throw badRequest("Invalid document owner.");
    const doc = await uploadDocument(ctx, file, { ...fields, entityType: fields.entityType ?? null, entityId: fields.entityId ?? null });
    return created({ id: doc.id }, "Document uploaded.");
  },
);
