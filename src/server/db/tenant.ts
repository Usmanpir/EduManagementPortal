import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./client";

/**
 * Models that belong to exactly one organization. Every query issued through
 * `tenantDb(orgId)` against these models is automatically constrained to that
 * organization — reads, updates and deletes get `organizationId` added to their
 * `where`, creates get it stamped onto `data`.
 *
 * This is the primary tenant-isolation guarantee. Services still validate
 * cross-references (e.g. a sectionId supplied by a client) through this client,
 * which makes foreign ids simply "not found".
 */
export const TENANT_MODELS = new Set<Prisma.ModelName>([
  "Campus",
  "User",
  "Invitation",
  "Role",
  "UserRole",
  "AcademicYear",
  "Department",
  "Class",
  "Section",
  "Subject",
  "ClassSubject",
  "TeacherSubject",
  "Room",
  "Period",
  "TimetableEntry",
  "Student",
  "Guardian",
  "StudentGuardian",
  "Staff",
  "Teacher",
  "AttendanceSession",
  "Attendance",
  "AttendanceCorrection",
  "StaffAttendance",
  "LeaveRequest",
  "FeeStructure",
  "StudentFee",
  "Invoice",
  "InvoiceItem",
  "Payment",
  "Sequence",
  "Exam",
  "ExamSubject",
  "Mark",
  "Result",
  "Announcement",
  "Notification",
  "NotificationDelivery",
  "IntegrationCredential",
  "Document",
  "Subscription",
  "SubscriptionUsage",
  "BillingInvoice",
  "AuditLog",
  "SupportTicket",
  "SupportTicketMessage",
  "ImportBatch",
]);

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantViolationError";
  }
}

type AnyArgs = Record<string, unknown> & {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: Record<string, unknown>;
};

function stamp(data: unknown, organizationId: string, model: string): Record<string, unknown> {
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.organizationId !== undefined && row.organizationId !== organizationId) {
    throw new TenantViolationError(`Attempted to write ${model} into another organization`);
  }
  return { ...row, organizationId };
}

export function scopeArgs(model: string, operation: string, rawArgs: unknown, organizationId: string): AnyArgs {
  const args = { ...((rawArgs ?? {}) as AnyArgs) };

  if (model === "Organization") {
    if (WHERE_OPERATIONS.has(operation)) {
      args.where = { ...args.where, id: organizationId };
      return args;
    }
    throw new TenantViolationError(`Operation ${operation} on Organization is not allowed through a tenant client`);
  }

  if (!TENANT_MODELS.has(model as Prisma.ModelName)) return args;

  if (WHERE_OPERATIONS.has(operation)) {
    args.where = { ...args.where, organizationId };
    // Never allow the scope to be changed by an update payload.
    if ((operation === "update" || operation === "updateMany" || operation === "updateManyAndReturn") && args.data) {
      const data = args.data as Record<string, unknown>;
      if (data.organizationId !== undefined && data.organizationId !== organizationId) {
        throw new TenantViolationError(`Attempted to move ${model} to another organization`);
      }
    }
    return args;
  }

  switch (operation) {
    case "create":
      args.data = stamp(args.data, organizationId, model);
      return args;
    case "createMany":
    case "createManyAndReturn":
      args.data = Array.isArray(args.data)
        ? args.data.map((row) => stamp(row, organizationId, model))
        : stamp(args.data, organizationId, model);
      return args;
    case "upsert":
      args.where = { ...args.where, organizationId };
      args.create = stamp(args.create, organizationId, model);
      return args;
    default:
      throw new TenantViolationError(`Unsupported tenant operation ${operation} on ${model}`);
  }
}

function createTenantClient(organizationId: string) {
  return db.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(scopeArgs(model, operation, args, organizationId) as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof createTenantClient>;

const cache = new Map<string, TenantDb>();

/** Organization-scoped Prisma client. Cached per organization for the process lifetime. */
export function tenantDb(organizationId: string): TenantDb {
  if (!organizationId) throw new TenantViolationError("Missing organization id");
  let client = cache.get(organizationId);
  if (!client) {
    client = createTenantClient(organizationId);
    if (cache.size > 500) cache.clear();
    cache.set(organizationId, client);
  }
  return client;
}
