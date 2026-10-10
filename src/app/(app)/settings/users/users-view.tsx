"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Ellipsis, Mail, RotateCw, ShieldCheck, UserPlus, Users, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { PersonAvatar } from "@/components/common/person-avatar";
import { RelativeTime } from "@/components/common/relative-time";
import { DataTable } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { api, errorMessage } from "@/lib/api-client";
import { AccessDrawer, InviteDrawer, type CampusOption, type RoleOption } from "./user-drawers";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  status: "ACTIVE" | "INVITED" | "DISABLED";
  lastLoginAt: string | null;
  roles: { roleId: string; key: string; name: string; campusId: string | null; campusName: string | null }[];
};

type Invitation = { id: string; email: string; roleName: string; campusName: string | null; expiresAt: string; expired: boolean };

const STATUS_BADGE = {
  ACTIVE: { label: "Active", variant: "success" },
  INVITED: { label: "Invited", variant: "info" },
  DISABLED: { label: "Disabled", variant: "neutral" },
} as const;

function RoleBadges({ roles }: { roles: UserRow["roles"] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <Badge key={`${r.roleId}-${r.campusId}`} variant={r.key === "admin" ? "primary" : "secondary"}>
          {r.name}
          {r.campusName && <span className="font-normal text-muted-foreground">· {r.campusName}</span>}
        </Badge>
      ))}
    </div>
  );
}

export function UsersView({
  users,
  total,
  page,
  pageSize,
  invitations,
  roles,
  campuses,
  canManage,
  currentUserId,
}: {
  users: UserRow[];
  total: number;
  page: number;
  pageSize: number;
  invitations: Invitation[];
  roles: RoleOption[];
  campuses: CampusOption[];
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<{ user: UserRow; key: number } | null>(null);
  const [disabling, setDisabling] = useState<UserRow | null>(null);

  const setStatus = useCallback(
    async (user: UserRow, status: "ACTIVE" | "DISABLED") => {
      try {
        await api.patch(`/api/users/${user.id}`, { status });
        toast.success(status === "ACTIVE" ? `${user.name} can sign in again.` : `${user.name} has been disabled.`);
        router.refresh();
      } catch (error) {
        toast.error(errorMessage(error));
        throw error;
      }
    },
    [router],
  );

  const invitationAction = async (id: string, action: "resend" | "revoke") => {
    try {
      const { message } = action === "resend" ? await api.post(`/api/invitations/${id}`, { action: "resend" }) : await api.delete(`/api/invitations/${id}`);
      toast.success(message);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const columns = useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        id: "user",
        header: "User",
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <PersonAvatar name={row.original.name} />
            <div className="min-w-0">
              <p className="truncate font-medium">
                {row.original.name}
                {row.original.id === currentUserId && <span className="ms-1.5 text-caption font-normal text-muted-foreground">(you)</span>}
              </p>
              <p className="truncate text-caption text-muted-foreground">{row.original.email}</p>
            </div>
          </div>
        ),
      },
      { id: "roles", header: "Roles", meta: { label: "Roles" }, cell: ({ row }) => <RoleBadges roles={row.original.roles} /> },
      {
        id: "status",
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row }) => {
          const s = STATUS_BADGE[row.original.status];
          return (
            <Badge variant={s.variant} dot>
              {s.label}
            </Badge>
          );
        },
      },
      {
        id: "lastLogin",
        header: "Last active",
        meta: { label: "Last active" },
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.lastLoginAt ? <RelativeTime date={row.original.lastLoginAt} /> : "Never"}
          </span>
        ),
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: () => <span className="sr-only">Actions</span>,
              meta: { alwaysVisible: true, align: "end" as const, className: "w-12" },
              cell: ({ row }: { row: { original: UserRow } }) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.name}`}>
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing({ user: row.original, key: Date.now() })}>
                      <ShieldCheck /> Edit access
                    </DropdownMenuItem>
                    {row.original.id !== currentUserId && (
                      <>
                        <DropdownMenuSeparator />
                        {row.original.status === "DISABLED" ? (
                          <DropdownMenuItem onSelect={() => setStatus(row.original, "ACTIVE").catch(() => undefined)}>
                            <RotateCw /> Re-enable
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem variant="destructive" onSelect={() => setDisabling(row.original)}>
                            <UserX /> Disable sign-in
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            } satisfies ColumnDef<UserRow>,
          ]
        : []),
    ],
    [canManage, currentUserId, setStatus],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-h2">Users</h2>
          <p className="text-small text-muted-foreground">Everyone who can sign in to your organization and what they can access.</p>
        </div>
        {canManage && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus /> Invite user
          </Button>
        )}
      </div>

      {invitations.length > 0 && (
        <section aria-labelledby="pending-heading" className="rounded-xl border bg-card shadow-xs">
          <h3 id="pending-heading" className="flex items-center gap-2 border-b px-4 py-3 text-h3">
            <Mail className="size-4 text-muted-foreground" /> Pending invitations
            <Badge variant="info">{invitations.length}</Badge>
          </h3>
          <ul className="divide-y">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-small font-medium">{inv.email}</p>
                  <p className="text-caption text-muted-foreground">
                    {inv.roleName}
                    {inv.campusName ? ` · ${inv.campusName}` : ""} ·{" "}
                    {inv.expired ? (
                      <span className="text-danger-foreground">Expired</span>
                    ) : (
                      <>
                        Expires <RelativeTime date={inv.expiresAt} />
                      </>
                    )}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => invitationAction(inv.id, "resend")}>
                      <RotateCw /> Resend
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => invitationAction(inv.id, "revoke")}>
                      <X /> Revoke
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div>
        <DataTable
          filters={
            <FilterBar
              searchPlaceholder="Search by name or email"
              filters={[
                { key: "role", label: "Role", multiple: true, options: roles.map((r) => ({ value: r.key, label: r.name })) },
                {
                  key: "status",
                  label: "Status",
                  multiple: true,
                  options: [
                    { value: "ACTIVE", label: "Active" },
                    { value: "DISABLED", label: "Disabled" },
                  ],
                },
              ]}
            />
          }
          tableId="users"
          columns={columns}
          data={users}
          getRowId={(u) => u.id}
          pagination={{ page, pageSize, total, noun: "users" }}
          caption="Users"
          mobileCard={(u) => (
            <div className="flex items-start gap-3">
              <PersonAvatar name={u.name} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium">{u.name}</p>
                  <Badge variant={STATUS_BADGE[u.status].variant} dot>
                    {STATUS_BADGE[u.status].label}
                  </Badge>
                </div>
                <p className="truncate text-caption text-muted-foreground">{u.email}</p>
                <div className="mt-2">
                  <RoleBadges roles={u.roles} />
                </div>
                {canManage && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditing({ user: u, key: Date.now() })}>
                    <ShieldCheck /> Edit access
                  </Button>
                )}
              </div>
            </div>
          )}
          empty={
            <EmptyState
              icon={Users}
              title="No users match"
              description="Try a different search or clear the filters."
            />
          }
        />
      </div>

      <InviteDrawer open={inviteOpen} onOpenChange={setInviteOpen} roles={roles} campuses={campuses} />
      {editing && (
        <AccessDrawer key={editing.key} user={editing.user} roles={roles} campuses={campuses} onClose={() => setEditing(null)} />
      )}
      <ConfirmDialog
        open={!!disabling}
        onOpenChange={(o) => !o && setDisabling(null)}
        tone="danger"
        title={`Disable ${disabling?.name ?? "user"}?`}
        description="They'll be signed out everywhere and won't be able to sign in. Their records and history stay intact, and you can re-enable them anytime."
        confirmLabel="Disable sign-in"
        onConfirm={async () => {
          if (disabling) await setStatus(disabling, "DISABLED");
        }}
      />
    </div>
  );
}
