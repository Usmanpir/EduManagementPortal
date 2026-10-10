import { z } from "zod";
import { created, ok, route } from "@/server/http/api";
import { listSubjects, saveSubject } from "@/server/modules/academics/service";
import { subjectSchema } from "@/lib/validation/academics";

const query = z.object({
  q: z.string().max(100).optional(),
  type: z.string().optional().transform((v) => v?.split(",").filter(Boolean)),
});

export const GET = route({ permission: "academics.view", query }, async ({ ctx, query }) => ok(await listSubjects(ctx, query)));

export const POST = route({ permission: "academics.manage", body: subjectSchema }, async ({ ctx, body }) =>
  created(await saveSubject(ctx, null, body), "Subject created."),
);
