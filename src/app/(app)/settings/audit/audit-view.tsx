"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ScrollText } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/common/empty-state";
import { DataTable } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";

type Row = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  user: string;
  userEmail: string | null;
  ipAddress: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
};

/** "student.archive" → "Student archived"-style readable text. */
export function describeAction(action: string) {
  const [entity = "", verb = ""] = action.split(".");
  const nice = (s: string) => s.replace(/_/g, " ");
  const past: Record<string, string> = {
    create: "created",
    update: "updated",
    delete: "deleted",
    archive: "archived",
    login: "signed in",
    logout: "signed out",
    login_failed: "failed sign-in",
    register: "registered",
    invite: "invited",
    invite_accept: "accepted invitation",
    invite_revoke: "invitation revoked",
    invite_resend: "invitation resent",
    roles_update: "roles changed",
    disable: "disabled",
    enable: "re-enabled",
    password_reset: "password reset",
    password_change: "password changed",
  };
  return `${nice(entity).replace(/^\w/, (c) => c.toUpperCase())} ${past[verb] ?? nice(verb)}`;
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-caption font-medium text-muted-foreground uppercase">{title}</h3>
      <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-caption leading-relaxed whitespace-pre-wrap break-all">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

export function AuditView({ rows, total, page, pageSize, entities, timezone }: { rows: Row[]; total: number; page: number; pageSize: number; entities: string[]; timezone: string }) {
  const [selected, setSelected] = useState<Row | null>(null);
  const when = useCallback((iso: string) => formatInTimeZone(new Date(iso), timezone, "d MMM yyyy, HH:mm"), [timezone]);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { id: "when", header: "When", meta: { label: "When", className: "whitespace-nowrap" }, cell: ({ row }) => <span className="tabular text-muted-foreground">{when(row.original.createdAt)}</span> },
      {
        id: "user",
        header: "User",
        meta: { label: "User" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.user}</p>
            {row.original.userEmail && <p className="truncate text-caption text-muted-foreground">{row.original.userEmail}</p>}
          </div>
        ),
      },
      {
        id: "action",
        header: "Action",
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <button type="button" onClick={() => setSelected(row.original)} className="text-start font-medium hover:underline">
            {describeAction(row.original.action)}
          </button>
        ),
      },
      { id: "entity", header: "Record", meta: { label: "Record" }, cell: ({ row }) => <Badge variant="secondary">{row.original.entityType}</Badge> },
      { id: "ip", header: "IP address", meta: { label: "IP address" }, cell: ({ row }) => <span className="font-mono text-caption text-muted-foreground">{row.original.ipAddress ?? "—"}</span> },
    ],
    [when],
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-h2">Audit log</h2>
        <p className="text-small text-muted-foreground">A permanent record of sign-ins and every important change in your organization.</p>
      </div>
      <DataTable
        filters={
          <FilterBar
            searchPlaceholder="Search actions, e.g. attendance"
            filters={[{ key: "entity", label: "Record type", multiple: true, options: entities.map((e) => ({ value: e, label: e })) }]}
          />
        }
        tableId="audit"
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        pagination={{ page, pageSize, total, noun: "events" }}
        caption="Audit log"
        mobileCard={(r) => (
          <button type="button" className="flex w-full flex-col gap-1 text-start" onClick={() => setSelected(r)}>
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium">{describeAction(r.action)}</span>
              <Badge variant="secondary">{r.entityType}</Badge>
            </span>
            <span className="text-caption text-muted-foreground">
              {r.user} · {when(r.createdAt)}
            </span>
          </button>
        )}
        empty={<EmptyState icon={ScrollText} title="No activity found" description="Changes and sign-ins will appear here as they happen." />}
      />

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader className="border-b px-5 py-4 pe-12">
                <SheetTitle className="text-h2">{describeAction(selected.action)}</SheetTitle>
                <SheetDescription>
                  {selected.user} · {when(selected.createdAt)}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-small">
                  <dt className="text-muted-foreground">Record</dt>
                  <dd>{selected.entityType}</dd>
                  <dt className="text-muted-foreground">Record ID</dt>
                  <dd className="font-mono text-caption break-all">{selected.entityId ?? "—"}</dd>
                  <dt className="text-muted-foreground">IP address</dt>
                  <dd className="font-mono text-caption">{selected.ipAddress ?? "—"}</dd>
                </dl>
                <JsonBlock title="Before" value={selected.before} />
                <JsonBlock title="After" value={selected.after} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
