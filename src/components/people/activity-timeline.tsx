import { History } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { EmptyState } from "@/components/common/empty-state";

export type ActivityItem = { id: string; action: string; user: string; createdAt: string };

const LABELS: Record<string, string> = {
  "student.create": "Student added",
  "student.update": "Details updated",
  "student.archive": "Archived",
  "student.restore": "Restored to active",
  "student.guardian_add": "Guardian added",
  "student.guardian_update": "Guardian updated",
  "student.guardian_remove": "Guardian removed",
  "student.bulk_move": "Moved to another section",
  "student.bulk_archive": "Archived",
  "student.bulk_restore": "Restored to active",
  "staff.create": "Added to staff",
  "teacher.create": "Added as teacher",
  "staff.update": "Details updated",
  "staff.archive": "Moved to former staff",
  "document.upload": "Document uploaded",
  "document.archive": "Document removed",
  "attendance.mark": "Attendance marked",
  "attendance.correct": "Attendance corrected",
};

export function describeActivity(action: string) {
  return LABELS[action] ?? action.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function ActivityTimeline({ items, timezone }: { items: ActivityItem[]; timezone: string }) {
  if (items.length === 0) return <EmptyState compact icon={History} title="No activity yet" description="Changes to this record will appear here." />;
  return (
    <ol className="relative flex flex-col gap-5 ps-6 before:absolute before:inset-y-1 before:inset-s-[0.4375rem] before:w-px before:bg-border">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span aria-hidden className="absolute -inset-s-6 top-1 size-3.5 rounded-full border-2 border-card bg-primary/70 ring-1 ring-border" />
          <p className="text-small font-medium">{describeActivity(item.action)}</p>
          <p className="text-caption text-muted-foreground">
            {item.user} · {formatInTimeZone(new Date(item.createdAt), timezone, "d MMM yyyy, HH:mm")}
          </p>
        </li>
      ))}
    </ol>
  );
}
