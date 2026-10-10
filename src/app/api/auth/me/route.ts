import { ok, route } from "@/server/http/api";

export const GET = route({}, async ({ ctx }) =>
  ok({
    user: ctx.user,
    organization: { id: ctx.organization.id, name: ctx.organization.name, slug: ctx.organization.slug },
    campusId: ctx.campusId,
    permissions: [...ctx.permissions],
    roles: ctx.roleKeys,
  }),
);
