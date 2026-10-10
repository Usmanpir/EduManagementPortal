"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, CircleCheck, IdCard, QrCode, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PersonAvatar } from "@/components/common/person-avatar";
import { DateNav } from "@/components/attendance/date-nav";
import { STATUS_META, StatusPicker, type StatusKey } from "@/components/attendance/status";
import { api, errorMessage } from "@/lib/api-client";
import type { getStaffRegister } from "@/server/modules/attendance/staff";
import { TimePicker } from "@/components/common/date-pickers";

type Register = Awaited<ReturnType<typeof getStaffRegister>>;
type Entry = { status: StatusKey | null; checkIn: string | null };
const OPTIONS: StatusKey[] = ["PRESENT", "ABSENT", "LATE", "LEAVE", "HALF_DAY"];

export function StaffRegisterView({ register, today, canMark, qrEnabled, lateAfter }: { register: Register; today: string; canMark: boolean; qrEnabled: boolean; lateAfter: string }) {
  const router = useRouter();
  const initial = useMemo(() => Object.fromEntries(register.rows.map((r) => [r.id, { status: r.status as StatusKey | null, checkIn: r.checkIn }])), [register.rows]);
  const [entries, setEntries] = useState<Record<string, Entry>>(initial);
  const [serverInitial, setServerInitial] = useState(initial);
  if (serverInitial !== initial) {
    setServerInitial(initial);
    setEntries(initial);
  }
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const changed = register.rows.filter((r) => entries[r.id]?.status !== initial[r.id]?.status || entries[r.id]?.checkIn !== initial[r.id]?.checkIn);
  const counts = OPTIONS.reduce<Record<string, number>>((acc, k) => ((acc[k] = register.rows.filter((r) => entries[r.id]?.status === k).length), acc), {});
  const unmarked = register.rows.filter((r) => !entries[r.id]?.status).length;
  const visible = register.rows.filter((r) => !query || `${r.name} ${r.employeeCode} ${r.designation}`.toLowerCase().includes(query.toLowerCase()));

  const set = (id: string, patch: Partial<Entry>) => setEntries((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));

  const save = async () => {
    const rows = changed.filter((r) => entries[r.id]?.status);
    if (rows.length === 0) return;
    setSaving(true);
    try {
      const { message } = await api.post("/api/attendance/staff", {
        date: register.date,
        records: rows.map((r) => ({ staffId: r.id, status: entries[r.id]!.status, checkIn: entries[r.id]!.checkIn ?? "" })),
      });
      toast.success(message);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pb-28 md:pb-24">
      <PageHeader
        title="Staff attendance"
        description={`Check-ins after ${lateAfter} are marked late automatically.`}
        actions={
          <>
            {qrEnabled && canMark && (
              <Button variant="outline" asChild>
                <Link href="/attendance/staff/qr">
                  <QrCode /> Check-in QR
                </Link>
              </Button>
            )}
            <DateNav date={register.date} today={today} />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {OPTIONS.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-small">
            <span className={cn("size-2.5 rounded-full", STATUS_META[k].dot)} aria-hidden />
            {STATUS_META[k].label} <span className="tabular font-semibold">{counts[k]}</span>
          </span>
        ))}
        <span className="text-small text-muted-foreground">{unmarked} not recorded</span>
        {canMark && unmarked > 0 && register.date <= today && (
          <Button
            variant="outline"
            className="ms-auto"
            onClick={() => setEntries((prev) => Object.fromEntries(Object.entries(prev).map(([id, e]) => [id, e.status ? e : { ...e, status: "PRESENT" }])))}
          >
            <CheckCheck /> Mark the rest present
          </Button>
        )}
      </div>

      {register.rows.length === 0 ? (
        <EmptyState icon={IdCard} title="No staff yet" description="Add staff members to track their attendance." actions={<Button asChild><Link href="/staff">Go to staff</Link></Button>} />
      ) : (
        <>
          <div className="relative mb-2 max-w-xs">
            <Search className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a staff member" aria-label="Find a staff member" className="ps-9" />
          </div>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
            {visible.map((r) => {
              const e = entries[r.id]!;
              return (
                <li key={r.id} className={cn("flex flex-col gap-2 px-3 py-2.5 sm:px-4 lg:flex-row lg:items-center lg:gap-3", !e.status && "bg-muted/30")}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <PersonAvatar name={r.name} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground">
                        <span className="font-mono">{r.employeeCode}</span> · {r.designation}
                        {r.approvedLeave && <Badge variant="info">Approved leave</Badge>}
                        {r.source && r.source !== "MANUAL" && <Badge variant="neutral">{r.source === "QR" ? "QR check-in" : r.source.toLowerCase()}</Badge>}
                        {r.checkOut && <span>out {r.checkOut}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <TimePicker
                      ariaLabel={`Check-in time for ${r.name}`}
                      placeholder="Check-in"
                      value={e.checkIn ?? ""}
                      onChange={(v) => set(r.id, { checkIn: v || null })}
                      showNow
                      clearable
                      disabled={!canMark || !(e.status === "PRESENT" || e.status === "LATE" || e.status === "HALF_DAY")}
                      className="w-36 [&>button]:h-11"
                    />
                    <StatusPicker stretch options={OPTIONS} value={e.status} onChange={(st) => set(r.id, { status: st })} disabled={!canMark} label={`Status for ${r.name}`} compact />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {canMark && changed.length > 0 && (
        <div className="fixed inset-x-0 bottom-14 z-(--z-sticky) border-t bg-background/95 px-4 py-3 backdrop-blur-md md:sticky md:bottom-4 md:mt-4 md:rounded-xl md:border md:shadow-lg">
          <div className="mx-auto flex max-w-content items-center gap-3">
            <p className="hidden flex-1 text-small text-muted-foreground sm:block">{changed.length} changes not saved yet</p>
            <Button variant="ghost" onClick={() => setEntries(initial)} disabled={saving}>
              Discard
            </Button>
            <Button size="lg" className="flex-1 sm:flex-none" loading={saving} onClick={save}>
              <CircleCheck /> Save staff attendance
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
