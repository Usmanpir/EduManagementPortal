import { z } from "zod";
import { isoDate } from "./common";

const limit = z.union([z.null(), z.coerce.number().int().min(0).max(10_000_000)]);
export const LIMIT_KEYS = ["students", "teachers", "staff", "campuses", "storageMb", "notificationsPerMonth", "apiRequestsPerDay"] as const;
export const limitsSchema = z.object(Object.fromEntries(LIMIT_KEYS.map((k) => [k, limit])) as Record<(typeof LIMIT_KEYS)[number], typeof limit>);

export const planChangeRequestSchema = z.object({
  planKey: z.string().min(1).max(40),
  billingCycle: z.enum(["MONTHLY", "YEARLY"]),
  note: z.string().trim().max(1000).optional().default(""),
});

export const cancelSchema = z.object({ cancel: z.boolean(), reason: z.string().trim().max(500).optional().default("") });

export const TICKET_CATEGORIES = ["general", "billing", "technical", "data", "feature"] as const;
export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"] as const;

export const ticketSchema = z.object({
  subject: z.string().trim().min(4, "Describe the problem in a few words.").max(150),
  category: z.enum(TICKET_CATEGORIES).default("general"),
  priority: z.enum(TICKET_PRIORITIES).default("MEDIUM"),
  body: z.string().trim().min(10, "Tell us a bit more so we can help.").max(5000),
});
export const ticketReplySchema = z.object({ body: z.string().trim().min(1, "Write a reply.").max(5000), internal: z.boolean().default(false) });
export const ticketUpdateSchema = z.object({ status: z.enum(TICKET_STATUSES).optional(), priority: z.enum(TICKET_PRIORITIES).optional() });

// ── Platform (super admin) ──

export const subscriptionUpdateSchema = z.object({
  planId: z.uuid(),
  status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED"]),
  billingCycle: z.enum(["MONTHLY", "YEARLY", "CUSTOM"]),
  trialEndsAt: z.union([z.literal(""), isoDate]).optional().nullable().transform((v) => (v ? v : null)),
  currentPeriodEnd: isoDate,
  customPrice: z.union([z.literal(""), z.null(), z.coerce.number().min(0).max(100_000_000)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  /** Only the overridden keys; omitted keys follow the plan. */
  customLimits: z.partialRecord(z.enum(LIMIT_KEYS), limit).nullable().default(null),
  reason: z.string().trim().min(3, "Note why you're changing this.").max(300),
});

export const orgStatusSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]), reason: z.string().trim().min(3, "Give a reason.").max(300) });

export const billingInvoiceSchema = z
  .object({
    amount: z.coerce.number().positive("Enter an amount.").max(100_000_000),
    periodStart: isoDate,
    periodEnd: isoDate,
    dueAt: isoDate,
  })
  .refine((v) => v.periodEnd > v.periodStart, { path: ["periodEnd"], message: "Ends before it starts." });

export const markPaidSchema = z.object({ paidAt: isoDate, note: z.string().trim().min(3, "Record how it was paid, e.g. bank reference.").max(300) });

export const planSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9-]{2,30}$/, "Lowercase letters, numbers and dashes."),
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().min(5).max(200),
  priceMonthly: z.coerce.number().min(0).max(100_000_000),
  priceYearly: z.coerce.number().min(0).max(1_000_000_000),
  currency: z.string().trim().length(3).toUpperCase(),
  trialDays: z.coerce.number().int().min(0).max(90),
  limits: limitsSchema,
  features: z.array(z.string().trim().min(1).max(80)).max(20),
  isPublic: z.boolean(),
  isCustom: z.boolean(),
  highlighted: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(100),
});
