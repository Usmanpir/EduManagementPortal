import { z } from "zod";
import { created, ok, route } from "@/server/http/api";
import { createSection, listSections } from "@/server/modules/academics/service";
import { sectionSchema } from "@/lib/validation/academics";
import { pagination } from "@/lib/validation/common";

const query = pagination.extend({ classId: z.string().optional().transform((v) => v?.split(",").filter(Boolean)) });

export const GET = route({ permission: "academics.view", query }, async ({ ctx, query }) => ok(await listSections(ctx, query)));

export const POST = route({ permission: "academics.manage", body: sectionSchema }, async ({ ctx, body }) =>
  created(await createSection(ctx, body), "Section created."),
);
