"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Layers, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionDrawer, type SectionFormValue } from "@/components/academics/section-drawer";
import type { AcademicLookups } from "@/components/academics/types";
import { DataTable } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { useHotkey } from "@/components/shell/shell-context";

type Row = SectionFormValue & {
  className: string;
  campusName: string;
  students: number;
  classTeacher: string | null;
  roomName: string | null;
  academicYear: string | null;
};

function Seats({ students, capacity }: { students: number; capacity: number | null }) {
  return (
    <span className="tabular">
      {students}
      {capacity ? <span className="text-muted-foreground"> / {capacity}</span> : null}
      {capacity && students > capacity && (
        <Badge variant="warning" className="ms-2">
          Over capacity
        </Badge>
      )}
    </span>
  );
}

export function SectionsView({
  rows,
  total,
  page,
  pageSize,
  classes,
  lookups,
  canManage,
}: {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  classes: { id: string; name: string; campusId: string }[];
  lookups: AcademicLookups;
  canManage: boolean;
}) {
  const [drawer, setDrawer] = useState<{ open: boolean; value: SectionFormValue | null; key: number }>({ open: false, value: null, key: 0 });
  const open = (value: SectionFormValue | null) => setDrawer((d) => ({ open: true, value, key: d.key + 1 }));
  useHotkey("n", () => open(null), canManage && classes.length > 0);

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "section",
        header: "Section",
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <Link href={`/academics/classes/${row.original.classId}`} className="font-medium hover:underline">
            {row.original.className} — {row.original.name}
          </Link>
        ),
      },
      { id: "teacher", header: "Class teacher", meta: { label: "Class teacher" }, cell: ({ row }) => row.original.classTeacher ?? <span className="text-muted-foreground">Not assigned</span> },
      { id: "students", header: "Students", meta: { label: "Students" }, cell: ({ row }) => <Seats students={row.original.students} capacity={row.original.capacity} /> },
      { id: "room", header: "Room", meta: { label: "Room" }, cell: ({ row }) => row.original.roomName ?? <span className="text-muted-foreground">—</span> },
      { id: "year", header: "Academic year", meta: { label: "Academic year" }, cell: ({ row }) => row.original.academicYear ?? <span className="text-muted-foreground">—</span> },
      { id: "campus", header: "Campus", meta: { label: "Campus" }, cell: ({ row }) => <span className="text-muted-foreground">{row.original.campusName}</span> },
      ...(canManage
        ? [
            {
              id: "actions",
              header: () => <span className="sr-only">Actions</span>,
              meta: { alwaysVisible: true, align: "end" as const, className: "w-12" },
              cell: ({ row }: { row: { original: Row } }) => (
                <Button variant="ghost" size="icon-sm" aria-label={`Edit section ${row.original.className} ${row.original.name}`} onClick={() => open(row.original)}>
                  <Pencil />
                </Button>
              ),
            } satisfies ColumnDef<Row>,
          ]
        : []),
    ],
    [canManage],
  );

  return (
    <div>
      <PageHeader
        title="Sections"
        description="Every section across your classes, with its class teacher, room and seats."
        actions={
          canManage &&
          classes.length > 0 && (
            <Button onClick={() => open(null)}>
              <Plus /> Add section
            </Button>
          )
        }
      />
      {classes.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Create a class first"
          description="Sections belong to a class. Create a class like Grade 1 and add its sections."
          actions={
            canManage && (
              <Button asChild>
                <Link href="/academics/classes?new=1">Add class</Link>
              </Button>
            )
          }
        />
      ) : (
        <DataTable
          filters={<FilterBar searchPlaceholder="Search sections" filters={[{ key: "classId", label: "Class", multiple: true, options: classes.map((c) => ({ value: c.id, label: c.name })) }]} />}
          tableId="sections"
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          pagination={{ page, pageSize, total, noun: "sections" }}
          caption="Sections"
          mobileCard={(r) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {r.className} — {r.name}
                </p>
                <p className="text-small text-muted-foreground">{r.classTeacher ?? "No class teacher"}</p>
                <p className="mt-1 text-small">
                  <Seats students={r.students} capacity={r.capacity} /> students
                </p>
              </div>
              {canManage && (
                <Button variant="outline" size="icon-sm" aria-label="Edit section" onClick={() => open(r)}>
                  <Pencil />
                </Button>
              )}
            </div>
          )}
          empty={<EmptyState icon={Layers} title="No sections match" description="Try clearing the filters." />}
        />
      )}
      <SectionDrawer
        key={drawer.key}
        open={drawer.open}
        onOpenChange={(o) => setDrawer((d) => ({ ...d, open: o }))}
        lookups={lookups}
        classes={classes}
        value={drawer.value}
      />
    </div>
  );
}
