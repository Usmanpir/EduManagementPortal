import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { TenantViolationError } from "@/server/db/tenant";
import { env } from "@/server/env";
import { getTenantContext, assertCan, canAny, type TenantContext } from "@/server/auth/context";
import { assertSubscriptionWritable } from "@/server/modules/billing/guard";
import { enforceRateLimit, RATE_LIMITS, type RateLimitRule } from "@/server/security/rate-limit";
import { logger } from "@/server/logger";
import type { PermissionKey } from "@/lib/permissions";
import { requireSuperAdminApi } from "@/server/auth/platform";
import { AppError } from "./errors";

export type ApiSuccess<T> = { success: true; data: T; message: string };
export type ApiFailure = {
  success: false;
  error: { code: string; message: string; fields?: Record<string, string> };
};

export function ok<T>(data: T, message = "Success", status = 200) {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data, message }, { status });
}

export function created<T>(data: T, message = "Created") {
  return ok(data, message, 201);
}

export function fail(error: AppError) {
  return NextResponse.json<ApiFailure>(
    { success: false, error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } },
    { status: error.status },
  );
}

function zodFields(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    fields[path] ??= issue.message;
  }
  return fields;
}

/** Converts any thrown value into a safe API response. Never leaks internals. */
export function toErrorResponse(error: unknown, requestId?: string) {
  if (error instanceof AppError) return fail(error);
  if (error instanceof ZodError) {
    return fail(new AppError("VALIDATION_ERROR", "Please check the highlighted fields.", zodFields(error)));
  }
  if (error instanceof TenantViolationError) {
    logger.warn("tenant_violation", { requestId, message: error.message });
    return fail(new AppError("FORBIDDEN", "You don't have permission to do that."));
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return fail(new AppError("CONFLICT", "A record with these details already exists."));
    }
    if (error.code === "P2025") return fail(new AppError("NOT_FOUND", "Record not found."));
    if (error.code === "P2003") {
      return fail(new AppError("CONFLICT", "This record is linked to other data and cannot be changed that way."));
    }
  }
  logger.error("unhandled_api_error", { requestId, error });
  return fail(new AppError("INTERNAL_ERROR", "Something went wrong on our side. Please try again."));
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defence: session cookies are SameSite=Lax, and every state-changing
 * request must also come from our own origin.
 */
export function assertSameOrigin(req: NextRequest) {
  if (!MUTATING.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) {
    // Non-browser clients (no Origin) are allowed only when they carry no cookies.
    if (req.cookies.size > 0) throw new AppError("FORBIDDEN", "Cross-site request blocked.");
    return;
  }
  const allowed = new Set([new URL(env.APP_URL).origin, req.nextUrl.origin]);
  if (!allowed.has(origin)) throw new AppError("FORBIDDEN", "Cross-site request blocked.");
}

type RouteParams = Record<string, string | string[] | undefined>;

type HandlerArgs<TBody, TQuery, TAuth extends boolean> = {
  req: NextRequest;
  params: RouteParams;
  body: TBody;
  query: TQuery;
  ctx: TAuth extends true ? TenantContext : null;
  requestId: string;
};

type RouteOptions<TBodySchema extends ZodType | undefined, TQuerySchema extends ZodType | undefined, TAuth extends boolean> = {
  /** Defaults to true. Public routes (login, register…) set this to false. */
  auth?: TAuth;
  permission?: PermissionKey | PermissionKey[];
  /** At least one of these is required (checked before validation, like `permission`). */
  anyPermission?: PermissionKey[];
  /** Extra authorization that must pass before the request body is even read. */
  guard?: (ctx: TenantContext) => void;
  body?: TBodySchema;
  query?: TQuerySchema;
  rateLimit?: { key: (req: NextRequest) => string; rule: RateLimitRule };
  /** Skip the subscription read-only guard (e.g. billing routes). */
  allowInactiveSubscription?: boolean;
  /** Platform (super admin) route: checked before anything else, including validation. Use with `auth: false`. */
  platform?: boolean;
};

type Infer<T> = T extends ZodType ? z.infer<T> : undefined;

/**
 * Wraps a route handler with the standard pipeline:
 * origin check → auth → permission → subscription guard → rate limit → validation → handler → error mapping.
 */
export function route<
  TBodySchema extends ZodType | undefined = undefined,
  TQuerySchema extends ZodType | undefined = undefined,
  TAuth extends boolean = true,
>(
  options: RouteOptions<TBodySchema, TQuerySchema, TAuth>,
  handler: (args: HandlerArgs<Infer<TBodySchema>, Infer<TQuerySchema>, TAuth>) => Promise<Response>,
) {
  return async (req: NextRequest, segment: { params: Promise<RouteParams> }) => {
    const requestId = crypto.randomUUID();
    try {
      assertSameOrigin(req);
      if (options.platform) await requireSuperAdminApi();

      let ctx: TenantContext | null = null;
      if (options.auth !== false) {
        ctx = await getTenantContext();
        if (!ctx) throw new AppError("UNAUTHORIZED", "Please sign in to continue.");
        const perms = options.permission ? ([] as PermissionKey[]).concat(options.permission) : [];
        assertCan(ctx, ...perms);
        if (options.anyPermission && !canAny(ctx, ...options.anyPermission)) throw new AppError("FORBIDDEN", "You don't have permission to do that.");
        options.guard?.(ctx);
        if (MUTATING.has(req.method)) {
          if (!options.allowInactiveSubscription) await assertSubscriptionWritable(ctx.orgId);
          await enforceRateLimit(`mut:${ctx.user.id}`, RATE_LIMITS.mutation, "You're doing that too quickly. Please slow down.");
        }
      }

      if (options.rateLimit) await enforceRateLimit(options.rateLimit.key(req), options.rateLimit.rule);

      let body: unknown = undefined;
      if (options.body) {
        let json: unknown;
        try {
          const text = await req.text();
          json = text.trim() ? JSON.parse(text) : {};
        } catch {
          throw new AppError("BAD_REQUEST", "Request body must be valid JSON.");
        }
        body = options.body.parse(json);
      }

      let query: unknown = undefined;
      if (options.query) {
        query = options.query.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
      }

      const params = (await segment.params) ?? {};
      return await handler({
        req,
        params,
        body: body as Infer<TBodySchema>,
        query: query as Infer<TQuerySchema>,
        ctx: ctx as TAuth extends true ? TenantContext : null,
        requestId,
      });
    } catch (error) {
      return toErrorResponse(error, requestId);
    }
  };
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Extracts a single string route param. */
export function param(params: RouteParams, name: string): string {
  const value = params[name];
  if (typeof value !== "string" || !value) throw new AppError("BAD_REQUEST", `Missing ${name}.`);
  return value;
}

export const uuidParam = (params: RouteParams, name: string) => {
  const value = param(params, name);
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new AppError("NOT_FOUND", "Record not found.");
  return parsed.data;
};
