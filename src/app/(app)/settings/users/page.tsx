import type { Metadata } from "next";
import { z } from "zod";
import { can, requirePageContext } from "@/server/auth/context";
import { listPendingInvitations, listRoles, listUsers } from "@/server/modules/users/service";
import { listCampuses } from "@/server/modules/organizations/service";
import { pagination } from "@/lib/validation/common";
import { UsersView } from "./users-view";

export const metadata: Metadata = { title: "Users" };

const params = pagination.extend({
  role: z.string().optional().transform((v) => v?.split(",").filter(Boolean)),
  status: z.string().optional().transform((v) => v?.split(",").filter(Boolean)),
});

export default async function UsersPage({ searchParams }: PageProps<"/settings/users">) {
  const ctx = await requirePageContext("users.view");
  const query = params.parse(await searchParams);
  const [users, invitations, roles, campuses] = await Promise.all([
    listUsers(ctx, query),
    listPendingInvitations(ctx),
    listRoles(ctx),
    listCampuses(ctx),
  ]);
  return (
    <UsersView
      users={users.rows}
      total={users.total}
      page={query.page}
      pageSize={query.pageSize}
      invitations={invitations}
      roles={roles.map((r) => ({ id: r.id, key: r.key, name: r.name, grantable: r.permissions.every((p) => ctx.permissions.has(p as never)) }))}
      campuses={campuses.map((c) => ({ id: c.id, name: c.name }))}
      canManage={can(ctx, "users.manage")}
      currentUserId={ctx.user.id}
    />
  );
}
