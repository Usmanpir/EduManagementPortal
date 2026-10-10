"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Field } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { OptionSelect } from "@/components/common/option-select";
import { api, ApiError, errorMessage } from "@/lib/api-client";

type Options = {
  homeRoomId: string | null;
  subjects: { id: string; name: string; periodsPerWeek: number | null; scheduled: number; teacherId: string | null }[];
  teachers: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
};

// Options per class, shared between the grid (which preloads them) and the dialog,
// so the dialog opens with its fields ready instead of a loading state.
const optionsCache = new Map<string, Promise<Options>>();

export function loadLessonOptions(sectionId: string, { fresh = false } = {}) {
  let pending = fresh ? undefined : optionsCache.get(sectionId);
  if (!pending) {
    pending = api.get<Options>(`/api/timetable/options?sectionId=${sectionId}`).then((r) => r.data);
    // Failed loads aren't cached, so Retry asks the server again.
    pending.catch(() => optionsCache.delete(sectionId));
    optionsCache.set(sectionId, pending);
  }
  return pending;
}

type Entry = { id: string; subjectId: string; teacherId: string | null; roomId: string | null };

export function LessonDialog({
  sectionId,
  dayOfWeek,
  dayLabel,
  period,
  entry,
  onClose,
  onRemove,
}: {
  sectionId: string;
  dayOfWeek: number;
  dayLabel: string;
  period: { id: string; name: string; start: string; end: string };
  entry: Entry | null;
  onClose: () => void;
  onRemove?: () => Promise<void>;
}) {
  const router = useRouter();
  const [options, setOptions] = useState<Options | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(entry?.subjectId ?? null);
  const [teacherId, setTeacherId] = useState<string | null>(entry?.teacherId ?? null);
  const [roomId, setRoomId] = useState<string | null>(entry?.roomId ?? null);
  const [error, setError] = useState<{ message: string; fields?: Record<string, string> } | null>(null);
  const [saving, setSaving] = useState(false);

  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLessonOptions(sectionId)
      .then((data) => {
        if (cancelled) return;
        setOptions(data);
        if (!entry) setRoomId((r) => r ?? data.homeRoomId);
      })
      .catch((e) => !cancelled && setLoadError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [sectionId, entry, attempt]);

  const retry = () => {
    setLoadError(null);
    setAttempt((a) => a + 1);
  };

  const pickSubject = (id: string | null) => {
    setSubjectId(id);
    // Default to whoever teaches this subject to the section.
    const assigned = options?.subjects.find((s) => s.id === id)?.teacherId;
    if (assigned) setTeacherId(assigned);
  };

  const save = async () => {
    if (!subjectId) return setError({ message: "Choose a subject." });
    setSaving(true);
    setError(null);
    try {
      toast.success((await api.put("/api/timetable/entries", { sectionId, dayOfWeek, periodId: period.id, subjectId, teacherId, roomId })).message);
      void loadLessonOptions(sectionId, { fresh: true }).catch(() => undefined);
      router.refresh();
      onClose();
    } catch (e) {
      setError({ message: errorMessage(e), fields: e instanceof ApiError ? e.fields : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit lesson" : "Add lesson"}</DialogTitle>
          <DialogDescription>
            {dayLabel} · {period.name} ({period.start}–{period.end})
          </DialogDescription>
        </DialogHeader>
        {loadError && !options ? (
          <FormAlert
            action={
              <Button size="sm" variant="outline" onClick={retry}>
                <RotateCw /> Retry
              </Button>
            }
          >
            Couldn&apos;t load subjects and teachers. {loadError}
          </FormAlert>
        ) : !options ? (
          <div className="flex flex-col gap-4" aria-busy aria-label="Loading lesson options">
            {["Subject", "Teacher", "Room"].map((label) => (
              <div key={label} className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-muted-foreground">{label}</span>
                <Skeleton className="h-9" />
              </div>
            ))}
          </div>
        ) : options.subjects.length === 0 ? (
          <FormAlert variant="info">This class has no subjects yet. Choose its subjects under Academics → Classes first.</FormAlert>
        ) : (
          <div className="flex flex-col gap-4">
            {error && <FormAlert>{error.message}</FormAlert>}
            <Field label="Subject" htmlFor="lesson-subject" required>
              <OptionSelect
                id="lesson-subject"
                value={subjectId}
                onChange={pickSubject}
                options={options.subjects.map((s) => ({ value: s.id, label: s.name, hint: s.periodsPerWeek ? `${s.scheduled}/${s.periodsPerWeek} a week` : `${s.scheduled} a week` }))}
                placeholder="Choose a subject"
              />
            </Field>
            <Field label="Teacher" htmlFor="lesson-teacher" error={error?.fields?.teacherId}>
              <OptionSelect id="lesson-teacher" value={teacherId} onChange={setTeacherId} options={options.teachers.map((t) => ({ value: t.id, label: t.name }))} noneLabel="No teacher" invalid={!!error?.fields?.teacherId} />
            </Field>
            <Field label="Room" htmlFor="lesson-room" error={error?.fields?.roomId}>
              <OptionSelect id="lesson-room" value={roomId} onChange={setRoomId} options={options.rooms.map((r) => ({ value: r.id, label: r.name }))} noneLabel="No room" invalid={!!error?.fields?.roomId} />
            </Field>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          {onRemove ? (
            <Button
              variant="ghost"
              onClick={async () => {
                await onRemove();
                onClose();
              }}
            >
              <Trash2 /> Remove lesson
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} disabled={!options || options.subjects.length === 0}>
              Save lesson
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
