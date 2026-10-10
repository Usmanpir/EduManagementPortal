import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Lock, Plus, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { can, requirePageContext } from "@/server/auth/context";
import { listRoles } from "@/server/modules/users/service";
import { ALL_PERMISSIONS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const ctx = await requirePageContext("roles.view");
  const roles = await listRoles(ctx);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-h2">Roles & permissions</h2>
          <p className="text-small text-muted-foreground">Each person&apos;s access is the combination of their roles.</p>
        </div>
        {can(ctx, "roles.manage") && (
          <Button asChild>
            <Link href="/settings/roles/new">
              <Plus /> New role
            </Link>
          </Button>
        )}
      </div>

      <ul className="overflow-hidden rounded-xl border bg-card shadow-xs">
        {roles.map((role) => (
          <li key={role.id} className="border-b last:border-0">
            <Link
              href={`/settings/roles/${role.id}`}
              className="flex items-center gap-4 px-4 py-3.5 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                {role.key === "admin" ? <Lock className="size-4" /> : <ShieldCheck className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{role.name}</p>
                  {role.isSystem ? <Badge variant="secondary">Built-in</Badge> : <Badge variant="primary">Custom</Badge>}
                </div>
                {role.description && <p className="truncate text-small text-muted-foreground">{role.description}</p>}
              </div>
              <div className="hidden text-end text-small sm:block">
                <p className="tabular">{role.users} {role.users === 1 ? "user" : "users"}</p>
                <p className="text-caption text-muted-foreground tabular">
                  {role.permissions.length === ALL_PERMISSIONS.length ? "Full access" : `${role.permissions.length} permissions`}
                </p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
