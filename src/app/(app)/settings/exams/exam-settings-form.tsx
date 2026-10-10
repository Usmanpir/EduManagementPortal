"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { SettingsCard } from "@/components/common/settings-card";
import { api, errorMessage } from "@/lib/api-client";
import type { OrgSettings } from "@/server/modules/organizations/settings";

type Settings = OrgSettings["exams"];

/** Checks the scale reads as a proper ladder before it's saved. */
function scaleProblem(scale: Settings["gradingScale"]) {
  if (!scale.length) return "Add at least one grade.";
  if (scale.some((b) => !b.grade.trim())) return "Every band needs a grade.";
  if (new Set(scale.map((b) => b.grade.trim())).size !== scale.length) return "Grades must be unique.";
  if (new Set(scale.map((b) => b.min)).size !== scale.length) return "Two grades start at the same percentage.";
  if (!scale.some((b) => b.min === 0)) return "One grade must start at 0% so every score gets a grade.";
  if (scale.some((b) => b.min < 0 || b.min > 100)) return "Minimums must be between 0 and 100.";
  return null;
}

export function ExamSettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const problem = scaleProblem(s.gradingScale);
  const sorted = [...s.gradingScale].map((b, i) => ({ ...b, i })).sort((a, b) => b.min - a.min);
  const setBand = (i: number, patch: Partial<Settings["gradingScale"][number]>) => setS((p) => ({ ...p, gradingScale: p.gradingScale.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));

  const save = async () => {
    setSaving(true);
    try {
      toast.success((await api.patch("/api/settings/exams", { ...s, gradingScale: [...s.gradingScale].sort((a, b) => b.min - a.min) })).message);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard title="Passing" description="Used when results are computed. Changes apply the next time results are computed.">
        <div className="flex flex-col gap-4">
          <Field label="Overall pass percentage" htmlFor="passPercentage" hint="A student must reach this overall and pass every paper.">
            <Input id="passPercentage" type="number" min={0} max={100} className="w-28 tabular" value={s.passPercentage} onChange={(e) => setS((p) => ({ ...p, passPercentage: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))} />
          </Field>
          <div className="flex items-start justify-between gap-4">
            <Label htmlFor="showPosition" className="flex flex-col items-start gap-0.5 font-normal">
              <span className="font-medium">Show class position on report cards</span>
              <span className="text-caption text-muted-foreground">Some schools prefer not to rank students publicly.</span>
            </Label>
            <Switch id="showPosition" checked={s.showPosition} onCheckedChange={(v) => setS((p) => ({ ...p, showPosition: v }))} />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Grading scale" description="The grade for a percentage is the highest band it reaches.">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[5rem_6rem_1fr_auto] gap-2 text-caption text-muted-foreground">
            <span>Grade</span>
            <span>From (%)</span>
            <span>Remark</span>
            <span className="sr-only">Remove</span>
          </div>
          {sorted.map((b) => (
            <div key={b.i} className="grid grid-cols-[5rem_6rem_1fr_auto] gap-2">
              <Input aria-label="Grade" maxLength={4} value={b.grade} onChange={(e) => setBand(b.i, { grade: e.target.value })} />
              <Input aria-label={`${b.grade} starts at`} type="number" min={0} max={100} className="tabular" value={b.min} onChange={(e) => setBand(b.i, { min: Number(e.target.value) })} />
              <Input aria-label={`${b.grade} remark`} maxLength={40} value={b.remark} onChange={(e) => setBand(b.i, { remark: e.target.value })} />
              <Button variant="ghost" size="icon" aria-label={`Remove ${b.grade}`} disabled={s.gradingScale.length === 1} onClick={() => setS((p) => ({ ...p, gradingScale: p.gradingScale.filter((_, j) => j !== b.i) }))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <div>
            <Button variant="outline" size="sm" disabled={s.gradingScale.length >= 15} onClick={() => setS((p) => ({ ...p, gradingScale: [...p.gradingScale, { grade: "", min: 0, remark: "" }] }))}>
              <Plus /> Add grade
            </Button>
          </div>
          {problem && <FormAlert>{problem}</FormAlert>}
        </div>
      </SettingsCard>

      <SettingsCard title="Report cards">
        <Field label="Footer note" htmlFor="footer" hint="Printed at the bottom of every report card, e.g. the date school reopens.">
          <Textarea id="footer" rows={3} maxLength={500} value={s.reportCardFooter} onChange={(e) => setS((p) => ({ ...p, reportCardFooter: e.target.value }))} />
        </Field>
      </SettingsCard>

      {dirty && (
        <div className="sticky bottom-20 z-(--z-sticky) flex justify-end md:bottom-4">
          <div className="flex animate-enter items-center gap-2 rounded-lg border bg-popover p-1.5 ps-3 shadow-lg">
            <span className="text-small text-muted-foreground">Unsaved changes</span>
            <Button variant="ghost" size="sm" onClick={() => setS(initial)}>
              Discard
            </Button>
            <Button size="sm" loading={saving} disabled={!!problem} onClick={save}>
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
