"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Coffee, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { TimePicker } from "@/components/common/date-pickers";

type Row = { id: string | null; name: string; start: string; end: string; isBreak: boolean };
const pad = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** A typical school day used when a campus has no periods yet. */
function template(): Row[] {
  const rows: Row[] = [];
  let t = 8 * 60;
  for (let i = 1; i <= 8; i++) {
    if (i === 5) {
      rows.push({ id: null, name: "Break", start: pad(t), end: pad(t + 20), isBreak: true });
      t += 20;
    }
    rows.push({ id: null, name: `Period ${i}`, start: pad(t), end: pad(t + 40), isBreak: false });
    t += 40;
  }
  return rows;
}

export function BellScheduleDrawer({ open, onOpenChange, campuses, defaultCampusId }: { open: boolean; onOpenChange: (o: boolean) => void; campuses: { id: string; name: string }[]; defaultCampusId: string | null }) {
  const router = useRouter();
  const [campusId, setCampusId] = useState(defaultCampusId);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (id: string) => {
    setRows(null);
    try {
      const { data } = await api.get<{ id: string; name: string; startMinute: number; endMinute: number; isBreak: boolean }[]>(`/api/timetable/periods?campusId=${id}`);
      setRows(data.length ? data.map((p) => ({ id: p.id, name: p.name, start: pad(p.startMinute), end: pad(p.endMinute), isBreak: p.isBreak })) : template());
    } catch (e) {
      setError(errorMessage(e));
      setRows([]);
    }
  }, []);

  useEffect(() => {
    if (!campusId) return;
    let active = true;
    api
      .get<{ id: string; name: string; startMinute: number; endMinute: number; isBreak: boolean }[]>(`/api/timetable/periods?campusId=${campusId}`)
      .then(({ data }) => active && setRows(data.length ? data.map((p) => ({ id: p.id, name: p.name, start: pad(p.startMinute), end: pad(p.endMinute), isBreak: p.isBreak })) : template()))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [campusId]);

  const update = (i: number, patch: Partial<Row>) => setRows((prev) => prev!.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () =>
    setRows((prev) => {
      const last = prev?.[prev.length - 1];
      const start = last ? toMin(last.end) : 8 * 60;
      return [...(prev ?? []), { id: null, name: `Period ${(prev?.filter((r) => !r.isBreak).length ?? 0) + 1}`, start: pad(start), end: pad(start + 40), isBreak: false }];
    });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campusId || !rows) return;
    setSaving(true);
    setError(null);
    try {
      toast.success((await api.put("/api/timetable/periods", { campusId, periods: rows })).message);
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      const field = err instanceof ApiError && err.fields ? Object.entries(err.fields)[0] : null;
      const row = field ? Number(/periods\.(\d+)/.exec(field[0])?.[1]) : NaN;
      setError(Number.isFinite(row) ? `${rows[row]?.name ?? "A period"}: ${field![1]}` : errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Bell schedule" description="The periods and breaks of a school day. Lessons and period attendance follow this schedule." formId="bell-form" submitLabel="Save schedule" submitting={saving} size="lg">
      <form id="bell-form" onSubmit={save} noValidate className="flex flex-col gap-4">
        {campuses.length > 1 && (
          <Field label="Campus" htmlFor="bell-campus">
            <OptionSelect
              id="bell-campus"
              value={campusId}
              onChange={(v) => {
                setCampusId(v);
                if (v) void load(v);
              }}
              options={campuses.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>
        )}
        <FormAlert>{error}</FormAlert>
        {!rows ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2">
                <Input aria-label="Period name" value={r.name} onChange={(e) => update(i, { name: e.target.value })} className="h-9 w-36 flex-1" />
                <TimePicker ariaLabel={`${r.name} start`} value={r.start} onChange={(v) => update(i, { start: v })} className="w-32" />
                <span className="text-muted-foreground">–</span>
                <TimePicker ariaLabel={`${r.name} end`} value={r.end} onChange={(v) => update(i, { end: v })} className="w-32" />
                <label className="flex items-center gap-1.5 text-small text-muted-foreground">
                  <Switch checked={r.isBreak} onCheckedChange={(v) => update(i, { isBreak: v })} aria-label={`${r.name} is a break`} />
                  <Coffee className="size-3.5" /> Break
                </label>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${r.name}`} onClick={() => setRows((prev) => prev!.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ol>
        )}
        <Button type="button" variant="outline" className="self-start" onClick={add}>
          <Plus /> Add period
        </Button>
      </form>
    </FormDrawer>
  );
}
