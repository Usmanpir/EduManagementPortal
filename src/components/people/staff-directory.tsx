"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, IdCard, KeyRound, Plus, Presentation, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PersonAvatar } from "@/components/common/person-avatar";
import { DataTable } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { useHotkey } from "@/components/shell/shell-context";
import { StaffDrawer } from "./staff-drawer";
import { STAFF_STATUS_BADGE, type PeopleLookups } from "./types";

export type StaffRow = {
  id: string;
  name: string;
  employeeCode: string;
  designation: string;
  departmentName: string | null;
  campusName: string;
  phone: string | null;
  email: string | null;
  status: string;
  isTeacher: boolean;
  subjects: string[];
  sections: number;
  classTeacherOf: string[];
  hasLogin: boolean;
};

export function StaffDirectory({
  kind,
  rows,
  total,
  page,
  pageSize,
  lookups,
  defaultCampusId,
  showCampus,
  canManage,
  canToggleTeacher,
  canExport,
}: {
  kind: "teacher" | "staff";
  rows: StaffRow[];
  total: number;
  page: number;
  pageSize: number;
  lookups: PeopleLookups;
  defaultCampusId: string | null;
  showCampus: boolean;
  canManage: boolean;
  canToggleTeacher: boolean;
  canExport: boolean;
}) {
  const searchParams = useSearchParams();
  const [drawer, setDrawer] = useState({ open: canManage && searchParams.get("new") === "1", key: 0 });
  const openNew = () => setDrawer((d) => ({ open: true, key: d.key + 1 }));
  useHotkey("n", openNew, canManage);
  const isTeachers = kind === "teacher";
  const base = isTeachers ? "/teachers" : "/staff";
  const hasFilters = ["q", "departmentId", "status"].some((k) => searchParams.get(k));
  const exportHref = (format: "csv" | "xlsx") => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("page");
    p.set("format", format);
    p.set("kind", isTeachers ? "teacher" : "all");
    return `/api/staff/export?${p.toString()}`;
  };

  const columns = useMemo<ColumnDef<StaffRow>[]>(
    () => [
      {
        id: "person",
        header: isTeachers ? "Teacher" : "Name",
        meta: { alwaysVisible: true, sortKey: "name" },
        cell: ({ row }) => (
          <Link href={`${row.original.isTeacher ? "/teachers" : "/staff"}/${row.original.id}`} className="flex min-w-0 items-center gap-3">
            <PersonAvatar name={row.original.name} />
            <span className="min-w-0">
              <span className="block truncate font-medium hover:underline">{row.original.name}</span>
              <span className="block font-mono text-caption text-muted-foreground">{row.original.employeeCode}</span>
            </span>
          </Link>
        ),
      },
      {
        id: "designation",
        header: "Designation",
        meta: { label: "Designation", sortKey: "designation" },
        cell: ({ row }) => (
          <span className="block min-w-0">
            <span className="block truncate">{row.original.designation}</span>
            {row.original.departmentName && <span className="block truncate text-caption text-muted-foreground">{row.original.departmentName}</span>}
          </span>
        ),
      },
      ...(isTeachers
        ? [
            {
              id: "teaching",
              header: "Teaches",
              meta: { label: "Teaches" },
              cell: ({ row }: { row: { original: StaffRow } }) =>
                row.original.subjects.length ? (
                  <span className="block min-w-0">
                    <span className="block truncate">{row.original.subjects.join(", ")}</span>
                    <span className="block text-caption text-muted-foreground">
                      {row.original.sections} class {row.original.sections === 1 ? "subject" : "subjects"}
                      {row.original.classTeacherOf.length ? ` · Class teacher ${row.original.classTeacherOf.join(", ")}` : ""}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">{row.original.classTeacherOf.length ? `Class teacher ${row.original.classTeacherOf.join(", ")}` : "No classes assigned"}</span>
                ),
            } satisfies ColumnDef<StaffRow>,
          ]
        : [
            {
              id: "type",
              header: "Type",
              meta: { label: "Type" },
              cell: ({ row }: { row: { original: StaffRow } }) => <Badge variant={row.original.isTeacher ? "primary" : "secondary"}>{row.original.isTeacher ? "Teacher" : "Staff"}</Badge>,
            } satisfies ColumnDef<StaffRow>,
          ]),
      {
        id: "contact",
        header: "Contact",
        meta: { label: "Contact" },
        cell: ({ row }) => (
          <span className="block min-w-0">
            {row.original.phone ? (
              <a href={`tel:${row.original.phone}`} className="block truncate hover:underline">
                {row.original.phone}
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            {row.original.email && <span className="block truncate text-caption text-muted-foreground">{row.original.email}</span>}
          </span>
        ),
      },
      ...(showCampus ? [{ id: "campus", header: "Campus", meta: { label: "Campus" }, cell: ({ row }: { row: { original: StaffRow } }) => <span className="text-muted-foreground">{row.original.campusName}</span> } satisfies ColumnDef<StaffRow>] : []),
      {
        id: "status",
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row }) => {
          const s = STAFF_STATUS_BADGE[row.original.status] ?? STAFF_STATUS_BADGE.ACTIVE!;
          return (
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge variant={s.variant} dot>
                {s.label}
              </Badge>
              {row.original.hasLogin && (
                <span title="Can sign in to EduAttend" className="text-muted-foreground">
                  <KeyRound className="size-3.5" aria-label="Has sign-in" />
                </span>
              )}
            </span>
          );
        },
      },
    ],
    [isTeachers, showCampus],
  );

  const Icon = isTeachers ? Presentation : IdCard;

  return (
    <div>
      <PageHeader
        title={isTeachers ? "Teachers" : "Staff"}
        description={isTeachers ? "Teaching staff, the subjects they teach and their classes." : "Every employee — teaching and non-teaching."}
        actions={
          <>
            {canManage && (
              <Button variant="outline" asChild>
                <Link href={`${base}/import`}>
                  <Upload /> Import
                </Link>
              </Button>
            )}
            {canExport && total > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Download /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <a href={exportHref("xlsx")}>Excel (.xlsx)</a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={exportHref("csv")}>CSV</a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canManage && (
              <Button onClick={openNew}>
                <Plus /> Add {isTeachers ? "teacher" : "staff"}
              </Button>
            )}
          </>
        }
      />
      {total === 0 && !hasFilters ? (
        <EmptyState
          icon={Icon}
          title={isTeachers ? "No teachers yet" : "No staff yet"}
          description={isTeachers ? "Add teachers so they can be assigned subjects and mark attendance from their phones." : "Add your employees to track staff attendance and leave."}
          actions={
            canManage && (
              <>
                <Button onClick={openNew}>
                  <Plus /> Add {isTeachers ? "teacher" : "staff"}
                </Button>
                <Button variant="outline" asChild>
                  <Link href={`${base}/import`}>
                    <Upload /> Import from Excel
                  </Link>
                </Button>
              </>
            )
          }
        />
      ) : (
        <DataTable
          filters={
            <FilterBar
              searchPlaceholder="Search name, ID, phone or email"
              filters={[
                { key: "departmentId", label: "Department", multiple: true, options: lookups.departments.map((d) => ({ value: d.id, label: d.name })) },
                { key: "status", label: "Status", multiple: true, options: Object.entries(STAFF_STATUS_BADGE).map(([value, s]) => ({ value, label: s.label })) },
              ]}
            />
          }
          tableId={kind}
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          rowHref={(r) => `${r.isTeacher ? "/teachers" : "/staff"}/${r.id}`}
          pagination={{ page, pageSize, total, noun: isTeachers ? "teachers" : "staff" }}
          caption={isTeachers ? "Teachers" : "Staff"}
          mobileCard={(r) => (
            <div className="flex items-start gap-3">
              <PersonAvatar name={r.name} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium">{r.name}</p>
                  <Badge variant={STAFF_STATUS_BADGE[r.status]?.variant ?? "neutral"}>{STAFF_STATUS_BADGE[r.status]?.label}</Badge>
                </div>
                <p className="truncate text-small text-muted-foreground">{r.designation}</p>
                {isTeachers && r.subjects.length > 0 && <p className="truncate text-caption text-muted-foreground">{r.subjects.join(", ")}</p>}
              </div>
            </div>
          )}
          empty={<EmptyState icon={Icon} title="No one matches" description="Try a different search or clear the filters." />}
        />
      )}
      <StaffDrawer
        key={drawer.key}
        open={drawer.open}
        onOpenChange={(o) => setDrawer((d) => ({ ...d, open: o }))}
        lookups={lookups}
        value={null}
        defaultCampusId={defaultCampusId}
        kind={kind}
        canToggleTeacher={canToggleTeacher}
      />
    </div>
  );
}
