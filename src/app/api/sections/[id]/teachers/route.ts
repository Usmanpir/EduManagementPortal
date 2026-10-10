import { z } from "zod";
import { ok, route, uuidParam } from "@/server/http/api";
import { setTeachingAssignment } from "@/server/modules/academics/service";

const body = z.object({ subjectId: z.uuid(), teacherId: z.uuid().nullable() });

/** Sets who teaches a subject to this section. */
export const PUT = route({ permission: "academics.manage", body }, async ({ ctx, body, params }) => {
  await setTeachingAssignment(ctx, { sectionId: uuidParam(params, "id"), ...body });
  return ok(null, body.teacherId ? "Teacher assigned." : "Teacher removed.");
});
