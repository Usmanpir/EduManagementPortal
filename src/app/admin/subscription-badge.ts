export const SUBSCRIPTION_BADGE: Record<string, { label: string; variant: "success" | "info" | "danger" | "neutral" | "warning" }> = {
  ACTIVE: { label: "Active", variant: "success" },
  TRIALING: { label: "Trial", variant: "info" },
  PAST_DUE: { label: "Past due", variant: "warning" },
  CANCELED: { label: "Canceled", variant: "neutral" },
  SUSPENDED: { label: "Suspended", variant: "danger" },
};
