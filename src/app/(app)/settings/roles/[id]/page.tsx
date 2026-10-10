import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can, requirePageContext } from "@/server/auth/context";
import { listRoles } from "@/server/modules/users/service";
import { groupPermissionsByModule } from "@/lib/permissions";
import { RoleEditor } from "./role-editor";

export const metadata: Metadata = { title: "Edit role" };

export default async function RolePage({ params }: PageProps<"/settings/roles/[id]">) {
  const { id } = await params;
  const ctx = await requirePageContext("roles.view");
  const isNew = id === "new";
  if (isNew && !can(ctx, "roles.manage")) notFound();

  const role = isNew ? null : (await listRoles(ctx)).find((r) => r.id === id);
  if (!isNew && !role) notFound();

  return (
    <RoleEditor
      role={role ?? null}
      groups={groupPermissionsByModule()}
      held={[...ctx.permissions]}
      canManage={can(ctx, "roles.manage")}
    />
  );
}
