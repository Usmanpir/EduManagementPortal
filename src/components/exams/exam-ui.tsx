import { Badge } from "@/components/ui/badge";

export const EXAM_TYPE_LABELS: Record<string, string> = { QUIZ: "Quiz", MONTHLY: "Monthly test", MIDTERM: "Mid-term", FINAL: "Final", MOCK: "Mock", OTHER: "Other" };

export const EXAM_PHASE: Record<string, { label: string; variant: "neutral" | "info" | "warning" | "success" | "primary" }> = {
  DRAFT: { label: "Draft", variant: "neutral" },
  SCHEDULED: { label: "Scheduled", variant: "info" },
  ONGOING: { label: "In progress", variant: "warning" },
  COMPLETED: { label: "Marking", variant: "primary" },
  PUBLISHED: { label: "Results published", variant: "success" },
};

export function ExamPhaseBadge({ phase }: { phase: string }) {
  const p = EXAM_PHASE[phase] ?? EXAM_PHASE.DRAFT!;
  return (
    <Badge variant={p.variant} dot>
      {p.label}
    </Badge>
  );
}

export const RESULT_STATUS: Record<string, { label: string; variant: "success" | "danger" | "neutral" }> = {
  PASS: { label: "Pass", variant: "success" },
  FAIL: { label: "Fail", variant: "danger" },
  INCOMPLETE: { label: "Incomplete", variant: "neutral" },
};

export function ResultBadge({ status }: { status: string }) {
  const s = RESULT_STATUS[status] ?? RESULT_STATUS.INCOMPLETE!;
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
