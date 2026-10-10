"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, ArrowRightLeft, Download, Ellipsis, Eye, GraduationCap, Pencil, Phone, Plus, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Combobox } from "@/components/common/combobox";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PersonAvatar } from "@/components/common/person-avatar";
import { AttendanceMeter } from "@/components/people/attendance-meter";
import { StudentDrawer } from "@/components/people/student-drawer";
import { GENDER_LABELS, STUDENT_STATUS_BADGE, type PeopleLookups } from "@/components/people/types";
import { DataTable } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { useHotkey } from "@/components/shell/shell-context";
import { api, errorMessage } from "@/lib/api-client";

export type StudentRow = {
  id: string;
  admissionNo: string;
  name: string;
  gender: string | null;
  rollNumber: string | null;
  status: string;
  campusName: string;
  classId: string | null;
  className: string | null;
  sectionId: string | null;
  sectionName: string | null;
  guardian: { name: string; phone: string } | null;
  attendanceRate: number | null;
};

type Perms = { create: boolean; update: boolean; archive: boolean; import: boolean; export: boolean };

function placement(r: StudentRow) {
  return r.className ? `${r.className}${r.sectionName ? ` — ${r.sectionName}` : ""}` : null;
}

export function StudentsView({
  rows,
  total,
  page,
  pageSize,
  lookups,
  defaultCampusId,
  showCampus,
  perms,
}: {
  rows: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
  lookups: PeopleLookups;
  defaultCampusId: string | null;
  showCampus: boolean;
  perms: Perms;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drawer, setDrawer] = useState({ open: perms.create && searchParams.get("new") === "1", key: 0 });
  const [confirm, setConfirm] = useState<{ ids: string[]; action: "archive" | "restore" } | null>(null);
  const [moving, setMoving] = useState<{ ids: string[]; sectionId: string | null } | null>(null);
  const openNew = () => setDrawer((d) => ({ open: true, key: d.key + 1 }));
  useHotkey("n", openNew, perms.create);

  const viewingArchived = searchParams.get("status")?.includes("ARCHIVED") ?? false;
  const hasFilters = ["q", "classId", "sectionId", "status", "gender", "campusId"].some((k) => searchParams.get(k));
  const exportHref = (format: "csv" | "xlsx", ids?: string[]) => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("page");
    p.set("format", format);
    if (ids?.length) p.set("ids", ids.join(","));
    return `/api/students/export?${p.toString()}`;
  };

  const bulk = async (ids: string[], action: "archive" | "restore" | "move", sectionId?: string | null) => {
    try {
      const { message } = await api.post("/api/students/bulk", { ids, action, sectionId });
      toast.success(message);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const columns = useMemo<ColumnDef<StudentRow>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        meta: { alwaysVisible: true, sortKey: "name" },
        cell: ({ row }) => (
          <Link href={`/students/${row.original.id}`} className="flex min-w-0 items-center gap-3">
            <PersonAvatar name={row.original.name} />
            <span className="min-w-0">
              <span className="block truncate font-medium hover:underline">{row.original.name}</span>
              <span className="block font-mono text-caption text-muted-foreground">{row.original.admissionNo}</span>
            </span>
          </Link>
        ),
      },
      {
        id: "class",
        header: "Class",
        meta: { label: "Class", sortKey: "class" },
        cell: ({ row }) => placement(row.original) ?? <Badge variant="warning">Not placed</Badge>,
      },
      { id: "roll", header: "Roll", meta: { label: "Roll no.", sortKey: "roll", className: "w-16" }, cell: ({ row }) => <span className="tabular">{row.original.rollNumber ?? "—"}</span> },
      { id: "attendance", header: "Attendance", meta: { label: "Attendance" }, cell: ({ row }) => <AttendanceMeter rate={row.original.attendanceRate} /> },
      {
        id: "guardian",
        header: "Parent",
        meta: { label: "Parent / guardian" },
        cell: ({ row }) =>
          row.original.guardian ? (
            <span className="block min-w-0">
              <span className="block truncate">{row.original.guardian.name}</span>
              <a href={`tel:${row.original.guardian.phone}`} className="block text-caption text-muted-foreground hover:text-foreground">
                {row.original.guardian.phone}
              </a>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      ...(showCampus ? [{ id: "campus", header: "Campus", meta: { label: "Campus" }, cell: ({ row }: { row: { original: StudentRow } }) => <span className="text-muted-foreground">{row.original.campusName}</span> } satisfies ColumnDef<StudentRow>] : []),
      {
        id: "status",
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row }) => {
          const s = STUDENT_STATUS_BADGE[row.original.status] ?? STUDENT_STATUS_BADGE.ACTIVE!;
          return (
            <Badge variant={s.variant} dot>
              {s.label}
            </Badge>
          );
        },
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { alwaysVisible: true, align: "end", className: "w-12" },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.name}`}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/students/${row.original.id}`}>
                  <Eye /> View profile
                </Link>
              </DropdownMenuItem>
              {perms.update && (
                <DropdownMenuItem asChild>
                  <Link href={`/students/${row.original.id}?edit=1`}>
                    <Pencil /> Edit
                  </Link>
                </DropdownMenuItem>
              )}
              {perms.archive && (
                <>
                  <DropdownMenuSeparator />
                  {row.original.status === "ARCHIVED" ? (
                    <DropdownMenuItem onSelect={() => setConfirm({ ids: [row.original.id], action: "restore" })}>
                      <RotateCcw /> Restore
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ ids: [row.original.id], action: "archive" })}>
                      <Archive /> Archive
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [perms, showCampus],
  );

  const sectionOptions = lookups.sections.map((s) => ({ value: s.id, label: s.label }));
  const classOptions = [...new Map(lookups.sections.map((s) => [s.classId, { value: s.classId, label: s.className }])).values()];

  const filters = (
    <FilterBar
      searchPlaceholder="Search name, admission no. or parent phone"
      filters={[
        ...(showCampus ? [{ key: "campusId", label: "Campus", multiple: true, options: lookups.campuses.map((c) => ({ value: c.id, label: c.name })) }] : []),
        { key: "classId", label: "Class", multiple: true, options: classOptions },
        { key: "sectionId", label: "Section", multiple: true, options: sectionOptions },
        {
          key: "status",
          label: "Status",
          multiple: true,
          options: Object.entries(STUDENT_STATUS_BADGE).map(([value, s]) => ({ value, label: s.label })),
        },
        { key: "gender", label: "Gender", multiple: true, options: Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label })) },
      ]}
    />
  );

  return (
    <div>
      <PageHeader
        title="Students"
        description="Manage enrollment, profiles and academic placement."
        actions={
          <>
            {perms.import && (
              <Button variant="outline" asChild>
                <Link href="/students/import">
                  <Upload /> Import
                </Link>
              </Button>
            )}
            {perms.export && total > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Download /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="text-caption text-muted-foreground">{hasFilters ? "Matching students" : "All active students"}</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <a href={exportHref("xlsx")}>Excel (.xlsx)</a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={exportHref("csv")}>CSV</a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {perms.create && (
              <Button onClick={openNew}>
                <Plus /> Add student
              </Button>
            )}
          </>
        }
      />

      {total === 0 && !hasFilters ? (
        <EmptyState
          icon={GraduationCap}
          title="No students yet"
          description="Add your first student or import your existing student list from Excel or CSV."
          actions={
            <>
              {perms.create && (
                <Button onClick={openNew}>
                  <Plus /> Add student
                </Button>
              )}
              {perms.import && (
                <Button variant="outline" asChild>
                  <Link href="/students/import">
                    <Upload /> Import students
                  </Link>
                </Button>
              )}
            </>
          }
        />
      ) : (
        <DataTable
          filters={filters}
          tableId="students"
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          rowHref={(r) => `/students/${r.id}`}
          selectable={perms.archive || perms.update || perms.export}
          bulkActions={(selected, clear) => (
            <>
              {perms.update && (
                <Button size="sm" variant="outline" onClick={() => setMoving({ ids: selected.map((s) => s.id), sectionId: null })}>
                  <ArrowRightLeft /> Move to section
                </Button>
              )}
              {perms.export && (
                <Button size="sm" variant="outline" asChild>
                  <a href={exportHref("xlsx", selected.map((s) => s.id))} onClick={() => setTimeout(clear, 500)}>
                    <Download /> Export
                  </a>
                </Button>
              )}
              {perms.archive &&
                (viewingArchived ? (
                  <Button size="sm" variant="outline" onClick={() => setConfirm({ ids: selected.map((s) => s.id), action: "restore" })}>
                    <RotateCcw /> Restore
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive-subtle" onClick={() => setConfirm({ ids: selected.map((s) => s.id), action: "archive" })}>
                    <Archive /> Archive
                  </Button>
                ))}
            </>
          )}
          pagination={{ page, pageSize, total, noun: "students" }}
          caption="Students"
          mobileCard={(r) => (
            <div className="flex items-start gap-3">
              <PersonAvatar name={r.name} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-medium">{r.name}</p>
                  <AttendanceMeter rate={r.attendanceRate} />
                </div>
                <p className="text-small text-muted-foreground">
                  {placement(r) ?? "Not placed"}
                  {r.rollNumber ? ` · Roll ${r.rollNumber}` : ""}
                </p>
                {r.guardian && (
                  <a href={`tel:${r.guardian.phone}`} onClick={(e) => e.stopPropagation()} className="mt-1 inline-flex items-center gap-1 text-caption text-muted-foreground">
                    <Phone className="size-3" /> {r.guardian.name} · {r.guardian.phone}
                  </a>
                )}
              </div>
            </div>
          )}
          empty={<EmptyState icon={GraduationCap} title="No students match" description="Try a different search or clear the filters." />}
        />
      )}

      <StudentDrawer key={drawer.key} open={drawer.open} onOpenChange={(o) => setDrawer((d) => ({ ...d, open: o }))} lookups={lookups} value={null} defaultCampusId={defaultCampusId} />

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        tone={confirm?.action === "archive" ? "danger" : "default"}
        title={
          confirm?.action === "archive"
            ? `Archive ${confirm.ids.length === 1 ? "this student" : `${confirm.ids.length} students`}?`
            : `Restore ${confirm?.ids.length === 1 ? "this student" : `${confirm?.ids.length} students`}?`
        }
        description={
          confirm?.action === "archive"
            ? "This will remove them from active records but preserve historical data — attendance, fees and results stay intact."
            : "They'll return to active lists and attendance registers."
        }
        confirmLabel={confirm?.action === "archive" ? "Archive" : "Restore"}
        onConfirm={async () => {
          if (confirm) await bulk(confirm.ids, confirm.action);
        }}
      />

      <ConfirmDialog
        open={!!moving}
        onOpenChange={(o) => !o && setMoving(null)}
        title={`Move ${moving?.ids.length ?? 0} ${moving?.ids.length === 1 ? "student" : "students"}`}
        description="Roll numbers are cleared because they belong to a section. Attendance history is kept."
        confirmLabel="Move students"
        onConfirm={async () => {
          if (!moving?.sectionId) {
            toast.error("Choose a section first.");
            throw new Error("no section");
          }
          await bulk(moving.ids, "move", moving.sectionId);
        }}
      >
        <Combobox
          value={moving?.sectionId ?? null}
          onChange={(v) => setMoving((m) => (m ? { ...m, sectionId: v } : m))}
          options={sectionOptions}
          placeholder="Choose a section"
          searchPlaceholder="Search sections…"
        />
      </ConfirmDialog>
    </div>
  );
}
