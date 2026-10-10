"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, DoorOpen, Network, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { SettingsCard } from "@/components/common/settings-card";
import {
  AcademicYearDrawer,
  DepartmentDrawer,
  RoomDrawer,
  type DepartmentValue,
  type RoomValue,
  type YearValue,
} from "@/components/academics/simple-drawers";
import { ROOM_TYPE_LABELS } from "@/components/academics/types";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";

type Year = YearValue & { inUse: boolean };
type Department = DepartmentValue & { subjects: number; staff: number; classes: number };
type Room = RoomValue & { campusName: string };

type DrawerState<T> = { open: boolean; value: T | null; key: number };
function useDrawer<T>() {
  const [state, setState] = useState<DrawerState<T>>({ open: false, value: null, key: 0 });
  return {
    state,
    open: (value: T | null) => setState((s) => ({ open: true, value, key: s.key + 1 })),
    setOpen: (open: boolean) => setState((s) => ({ ...s, open })),
  };
}

export function AcademicSettingsView({
  years,
  departments,
  rooms,
  campuses,
  defaultCampusId,
}: {
  years: Year[];
  departments: Department[];
  rooms: Room[];
  campuses: { id: string; name: string }[];
  defaultCampusId: string | null;
}) {
  const router = useRouter();
  const yearDrawer = useDrawer<YearValue>();
  const deptDrawer = useDrawer<DepartmentValue>();
  const roomDrawer = useDrawer<RoomValue>();
  const [removing, setRemoving] = useState<{ kind: "year" | "department" | "room"; id: string; name: string } | null>(null);

  const removeUrl = (r: NonNullable<typeof removing>) =>
    r.kind === "year" ? `/api/academic-years/${r.id}` : r.kind === "department" ? `/api/departments/${r.id}` : `/api/rooms/${r.id}`;

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard
        title="Academic years"
        description="The current year is used by default for new sections, exams and fee structures."
        footer={
          <Button variant="outline" onClick={() => yearDrawer.open(null)}>
            <Plus /> Add academic year
          </Button>
        }
      >
        {years.length === 0 ? (
          <EmptyState compact icon={CalendarRange} title="No academic years yet" description="Add the current session, e.g. 2026–2027." />
        ) : (
          <ul className="-my-2 divide-y">
            {years.map((y) => (
              <li key={y.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    {y.name} {y.isCurrent && <Badge variant="success">Current</Badge>}
                  </p>
                  <p className="text-small text-muted-foreground">
                    {formatDate(y.startDate, "long")} – {formatDate(y.endDate, "long")}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${y.name}`} onClick={() => yearDrawer.open(y)}>
                  <Pencil />
                </Button>
                {!y.inUse && !y.isCurrent && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${y.name}`} onClick={() => setRemoving({ kind: "year", id: y.id, name: y.name })}>
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard
        title="Departments"
        description="Group classes, subjects and staff — e.g. Primary, Secondary, Sciences."
        footer={
          <Button variant="outline" onClick={() => deptDrawer.open(null)}>
            <Plus /> Add department
          </Button>
        }
      >
        {departments.length === 0 ? (
          <EmptyState compact icon={Network} title="No departments" description="Departments are optional but help larger institutions organize reports." />
        ) : (
          <ul className="-my-2 divide-y">
            {departments.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {d.name} <span className="font-mono text-caption text-muted-foreground">{d.code}</span>
                  </p>
                  <p className="text-small text-muted-foreground">
                    {d.classes} classes · {d.subjects} subjects · {d.staff} staff
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${d.name}`} onClick={() => deptDrawer.open(d)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Archive ${d.name}`} onClick={() => setRemoving({ kind: "department", id: d.id, name: d.name })}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard
        title="Rooms"
        description="Classrooms, labs and halls. Used for home rooms, timetables and exam seating."
        footer={
          <Button variant="outline" onClick={() => roomDrawer.open(null)}>
            <Plus /> Add room
          </Button>
        }
      >
        {rooms.length === 0 ? (
          <EmptyState compact icon={DoorOpen} title="No rooms yet" description="Add rooms to prevent timetable clashes between classes sharing a space." />
        ) : (
          <ul className="-my-2 grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-y-0 sm:gap-x-6">
            {rooms.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3 sm:border-b">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-small text-muted-foreground">
                    {ROOM_TYPE_LABELS[r.type]}
                    {r.capacity ? ` · ${r.capacity} seats` : ""} · {r.campusName}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.name}`} onClick={() => roomDrawer.open(r)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Archive ${r.name}`} onClick={() => setRemoving({ kind: "room", id: r.id, name: r.name })}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <AcademicYearDrawer key={`y${yearDrawer.state.key}`} open={yearDrawer.state.open} onOpenChange={yearDrawer.setOpen} value={yearDrawer.state.value} />
      <DepartmentDrawer key={`d${deptDrawer.state.key}`} open={deptDrawer.state.open} onOpenChange={deptDrawer.setOpen} value={deptDrawer.state.value} />
      <RoomDrawer
        key={`r${roomDrawer.state.key}`}
        open={roomDrawer.state.open}
        onOpenChange={roomDrawer.setOpen}
        value={roomDrawer.state.value}
        campuses={campuses}
        defaultCampusId={defaultCampusId}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        tone="danger"
        title={`Remove ${removing?.name ?? ""}?`}
        description={removing?.kind === "year" ? "This academic year isn't used anywhere and will be deleted." : "It will be archived and hidden from new records. Existing records keep their history."}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removing) return;
          try {
            const { message } = await api.delete(removeUrl(removing));
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
