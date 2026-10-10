"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, BookOpen, Ellipsis, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SubjectDrawer, type SubjectFormValue } from "@/components/academics/subject-drawer";
import { SUBJECT_TYPE_LABELS } from "@/components/academics/types";
import { DataTable } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { useHotkey } from "@/components/shell/shell-context";
import { api, errorMessage } from "@/lib/api-client";
import { SUBJECT_TYPES } from "@/lib/validation/academics";

type Row = SubjectFormValue & { departmentName: string | null; classes: string[]; teachers: number };

export function SubjectsView({ subjects, departments, canManage }: { subjects: Row[]; departments: { id: string; name: string }[]; canManage: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drawer, setDrawer] = useState<{ open: boolean; value: SubjectFormValue | null; key: number }>({
    open: canManage && searchParams.get("new") === "1",
    value: null,
    key: 0,
  });
  const [archiving, setArchiving] = useState<Row | null>(null);
  const open = (value: SubjectFormValue | null) => setDrawer((d) => ({ open: true, value, key: d.key + 1 }));
  useHotkey("n", () => open(null), canManage);
  const filtered = !!(searchParams.get("q") || searchParams.get("type"));

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "subject",
        header: "Subject",
        meta: { alwaysVisible: true },
        cell: ({ row }) => (
          <span className="flex items-center gap-2.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.original.color ?? "var(--muted-foreground)" }} aria-hidden />
            <span className="font-medium">{row.original.name}</span>
            <span className="font-mono text-caption text-muted-foreground">{row.original.code}</span>
          </span>
        ),
      },
      { id: "type", header: "Type", meta: { label: "Type" }, cell: ({ row }) => <Badge variant="secondary">{SUBJECT_TYPE_LABELS[row.original.type]}</Badge> },
      { id: "department", header: "Department", meta: { label: "Department" }, cell: ({ row }) => row.original.departmentName ?? <span className="text-muted-foreground">—</span> },
      {
        id: "classes",
        header: "Taught in",
        meta: { label: "Taught in" },
        cell: ({ row }) =>
          row.original.classes.length ? (
            <span className="line-clamp-1 text-muted-foreground">{row.original.classes.join(", ")}</span>
          ) : (
            <span className="text-muted-foreground">Not assigned to a class</span>
          ),
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: () => <span className="sr-only">Actions</span>,
              meta: { alwaysVisible: true, align: "end" as const, className: "w-12" },
              cell: ({ row }: { row: { original: Row } }) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.name}`}>
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => open(row.original)}>
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setArchiving(row.original)}>
                      <Archive /> Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
        title="Subjects"
        description="What your institution teaches. Assign them to classes and teachers from each class."
        actions={
          canManage && (
            <Button onClick={() => open(null)}>
              <Plus /> Add subject
            </Button>
          )
        }
      />
      {subjects.length === 0 && !filtered ? (
        <EmptyState
          icon={BookOpen}
          title="No subjects yet"
          description="Add subjects like Mathematics, English and Physics. They're used for timetables, attendance by period and exams."
          actions={canManage && <Button onClick={() => open(null)}><Plus /> Add subject</Button>}
        />
      ) : (
        <DataTable
          filters={
            <FilterBar
              searchPlaceholder="Search by name or code"
              filters={[{ key: "type", label: "Type", multiple: true, options: SUBJECT_TYPES.map((t) => ({ value: t, label: SUBJECT_TYPE_LABELS[t]! })) }]}
            />
          }
          tableId="subjects"
          columns={columns}
          data={subjects}
          getRowId={(r) => r.id}
          caption="Subjects"
          mobileCard={(r) => (
            <div className="flex items-start gap-3">
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color ?? "var(--muted-foreground)" }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {r.name} <span className="font-mono text-caption text-muted-foreground">{r.code}</span>
                </p>
                <p className="truncate text-small text-muted-foreground">{r.classes.join(", ") || "Not assigned to a class"}</p>
              </div>
              {canManage && (
                <Button variant="outline" size="icon-sm" aria-label={`Edit ${r.name}`} onClick={() => open(r)}>
                  <Pencil />
                </Button>
              )}
            </div>
          )}
          empty={<EmptyState icon={BookOpen} title="No subjects match" description="Try a different search." />}
        />
      )}
      <SubjectDrawer key={drawer.key} open={drawer.open} onOpenChange={(o) => setDrawer((d) => ({ ...d, open: o }))} departments={departments} value={drawer.value} />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        tone="danger"
        title={`Archive ${archiving?.name ?? "subject"}?`}
        description="It will be removed from new timetables and exams. Past marks and attendance stay intact."
        confirmLabel="Archive subject"
        onConfirm={async () => {
          if (!archiving) return;
          try {
            const { message } = await api.delete(`/api/subjects/${archiving.id}`);
            toast.success(message);
            router.refresh();
          } catch (error) {
            toast.error(errorMessage(error));
            throw error;
          }
        }}
      />
    </div>
  );
}
