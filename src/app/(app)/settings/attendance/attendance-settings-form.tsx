"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field, FieldRow } from "@/components/common/field";
import { OptionSelect } from "@/components/common/option-select";
import { SettingsCard } from "@/components/common/settings-card";
import { api, errorMessage } from "@/lib/api-client";
import type { OrgSettings } from "@/server/modules/organizations/settings";
import { TimePicker } from "@/components/common/date-pickers";

type Settings = OrgSettings["attendance"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <Label htmlFor={id} className="flex flex-col items-start gap-0.5 font-normal">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-caption text-muted-foreground">{hint}</span>}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function AttendanceSettingsForm({ initial, device }: { initial: Settings; device: { active: boolean; issuedAt: string | null } }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<"issue" | "revoke" | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const patch = (p: Partial<Settings>) => setS((prev) => ({ ...prev, ...p }));

  const save = async () => {
    setSaving(true);
    try {
      toast.success((await api.patch("/api/settings/attendance", s)).message);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard title="How attendance is taken">
        <div className="flex flex-col gap-4">
          <Field label="Attendance mode" htmlFor="mode" hint={s.mode === "PERIOD" ? "Teachers take a register in every timetabled period." : "One register per section per day, usually by the class teacher."}>
            <OptionSelect
              id="mode"
              value={s.mode}
              onChange={(v) => patch({ mode: (v as Settings["mode"]) ?? "DAILY" })}
              options={[
                { value: "DAILY", label: "Daily — once per day" },
                { value: "PERIOD", label: "Per period — every lesson" },
              ]}
            />
          </Field>
          <FieldRow>
            <Field label="Teachers can edit up to" htmlFor="window" hint="Older changes need a correction request.">
              <div className="flex items-center gap-2">
                <Input id="window" type="number" min={0} max={30} value={s.teacherEditWindowDays} onChange={(e) => patch({ teacherEditWindowDays: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })} className="w-24" />
                <span className="text-small text-muted-foreground">days back</span>
              </div>
            </Field>
            <Field label="Low attendance threshold" htmlFor="threshold" hint="Students below this are flagged and alerts are sent.">
              <div className="flex items-center gap-2">
                <Input id="threshold" type="number" min={50} max={100} value={s.lowAttendanceThreshold} onChange={(e) => patch({ lowAttendanceThreshold: Math.max(50, Math.min(100, Number(e.target.value) || 75)) })} className="w-24" />
                <span className="text-small text-muted-foreground">%</span>
              </div>
            </Field>
          </FieldRow>
          <Field label="Days off" htmlFor="days-off" hint="Registers aren't expected on these days.">
            <div id="days-off" role="group" className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => {
                const day = i + 1;
                const on = s.weeklyOffDays.includes(day);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => patch({ weeklyOffDays: on ? s.weeklyOffDays.filter((x) => x !== day) : [...s.weeklyOffDays, day].sort() })}
                    className={cn("h-9 rounded-md border px-3 text-small font-medium", on ? "border-primary bg-primary-subtle text-primary-subtle-foreground" : "bg-card text-muted-foreground hover:text-foreground")}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="Alerts" description="Messages go out on the channels enabled in Notifications settings.">
        <div className="-my-3 divide-y">
          <Toggle id="absent" label="Tell parents when their child is absent" hint="Sent as soon as the register is saved." checked={s.notifyGuardiansOnAbsence} onChange={(v) => patch({ notifyGuardiansOnAbsence: v })} />
          <Toggle id="late" label="Tell parents about late arrivals" checked={s.notifyGuardiansOnLate} onChange={(v) => patch({ notifyGuardiansOnLate: v })} />
          <Toggle id="low-guardian" label="Low attendance: alert parents" hint="At most once a week per student." checked={s.alertRecipients.guardian} onChange={(v) => patch({ alertRecipients: { ...s.alertRecipients, guardian: v } })} />
          <Toggle id="low-teacher" label="Low attendance: alert the class teacher" checked={s.alertRecipients.classTeacher} onChange={(v) => patch({ alertRecipients: { ...s.alertRecipients, classTeacher: v } })} />
          <Toggle id="low-student" label="Low attendance: alert the student" checked={s.alertRecipients.student} onChange={(v) => patch({ alertRecipients: { ...s.alertRecipients, student: v } })} />
        </div>
      </SettingsCard>

      <SettingsCard title="Staff check-in">
        <div className="flex flex-col gap-4">
          <div className="-my-3 divide-y">
            <Toggle id="qr" label="QR check-in" hint="Staff scan the daily code at reception with their phone." checked={s.staffQrCheckIn} onChange={(v) => patch({ staffQrCheckIn: v })} />
          </div>
          <Field label="Late after" htmlFor="lateAfter" hint="Check-ins after this time are marked late.">
            <TimePicker id="lateAfter" value={s.staffLateAfter} onChange={(v) => v && patch({ staffLateAfter: v })} className="w-32" />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="Biometric & RFID devices" description="Terminals (or their middleware) can send punches to EduAttend with a device key.">
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-small">
            <KeyRound className="size-4 text-muted-foreground" />
            {device.active ? `A device key is active (issued ${new Date(device.issuedAt!).toLocaleDateString()}).` : "No device key yet."}
          </p>
          {newKey && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-subtle p-3">
              <code className="min-w-0 flex-1 truncate font-mono text-caption">{newKey}</code>
              <Button size="xs" variant="outline" onClick={() => navigator.clipboard.writeText(newKey).then(() => toast.success("Copied."))}>
                <Copy /> Copy
              </Button>
            </div>
          )}
          <p className="text-caption text-muted-foreground">
            POST <code>/api/devices/attendance</code> with <code>Authorization: Bearer &lt;key&gt;</code> and punches identified by employee ID.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmKey("issue")}>
              {device.active ? "Replace key" : "Create device key"}
            </Button>
            {device.active && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmKey("revoke")}>
                Revoke
              </Button>
            )}
          </div>
        </div>
      </SettingsCard>

      {dirty && (
        <div className="sticky bottom-20 z-(--z-sticky) flex justify-end md:bottom-4">
          <div className="flex animate-enter items-center gap-2 rounded-lg border bg-popover p-1.5 ps-3 shadow-lg">
            <span className="text-small text-muted-foreground">Unsaved changes</span>
            <Button variant="ghost" size="sm" onClick={() => setS(initial)}>
              Discard
            </Button>
            <Button size="sm" loading={saving} onClick={save}>
              Save changes
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmKey}
        onOpenChange={(o) => !o && setConfirmKey(null)}
        tone={confirmKey === "revoke" ? "danger" : "default"}
        title={confirmKey === "revoke" ? "Revoke the device key?" : device.active ? "Replace the device key?" : "Create a device key?"}
        description={confirmKey === "issue" && device.active ? "Devices using the old key stop working until you update them." : confirmKey === "revoke" ? "Devices will no longer be able to send attendance." : "The key is shown once. Store it in your device software."}
        confirmLabel={confirmKey === "revoke" ? "Revoke key" : "Create key"}
        onConfirm={async () => {
          try {
            if (confirmKey === "revoke") {
              toast.success((await api.delete("/api/settings/device-key")).message);
              setNewKey(null);
            } else {
              const { data, message } = await api.post<{ key: string }>("/api/settings/device-key");
              setNewKey(data.key);
              toast.success(message);
            }
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
