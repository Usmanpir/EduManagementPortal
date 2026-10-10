import { Badge } from "@/components/ui/badge";

export const TICKET_STATUS: Record<string, { label: string; variant: "info" | "warning" | "success" | "neutral" | "primary" }> = {
  OPEN: { label: "Open", variant: "info" },
  IN_PROGRESS: { label: "In progress", variant: "primary" },
  WAITING_ON_CUSTOMER: { label: "Awaiting your reply", variant: "warning" },
  RESOLVED: { label: "Resolved", variant: "success" },
  CLOSED: { label: "Closed", variant: "neutral" },
};
export const CATEGORY_LABELS: Record<string, string> = { general: "General", billing: "Billing", technical: "Technical problem", data: "Data & imports", feature: "Feature request" };
export const PRIORITY_LABELS: Record<string, string> = { LOW: "Low", MEDIUM: "Normal", HIGH: "High", URGENT: "Urgent" };

export function TicketStatusBadge({ status, staffView = false }: { status: string; staffView?: boolean }) {
  const s = TICKET_STATUS[status] ?? TICKET_STATUS.OPEN!;
  return (
    <Badge variant={s.variant} dot>
      {staffView && status === "WAITING_ON_CUSTOMER" ? "Waiting on school" : s.label}
    </Badge>
  );
}

/** A conversation message bubble; support replies sit on the other side. */
export function MessageBubble({ author, body, at, mine, internal = false }: { author: string; body: string; at: React.ReactNode; mine: boolean; internal?: boolean }) {
  return (
    <li className={mine ? "flex justify-end" : "flex"}>
      <div className={`max-w-[85%] rounded-2xl border px-4 py-3 ${internal ? "border-warning/50 bg-warning-subtle/50" : mine ? "bg-primary-subtle/50" : "bg-card"}`}>
        <p className="mb-1 text-caption text-muted-foreground">
          <span className="font-medium text-foreground">{author}</span> · {at}
          {internal && <span className="ms-1 font-medium text-warning-foreground">· internal note</span>}
        </p>
        <p className="text-small whitespace-pre-line">{body}</p>
      </div>
    </li>
  );
}
