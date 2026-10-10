export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PLAN_LIMIT_REACHED"
  | "SUBSCRIPTION_INACTIVE"
  | "BAD_REQUEST"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PLAN_LIMIT_REACHED: 402,
  SUBSCRIPTION_INACTIVE: 402,
  BAD_REQUEST: 400,
  INTERNAL_ERROR: 500,
};

/** An error whose message is safe to show to end users. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(code: ErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.fields = fields;
  }
}

export const notFound = (what = "Record") => new AppError("NOT_FOUND", `${what} not found.`);
export const forbidden = (message = "You don't have permission to do that.") => new AppError("FORBIDDEN", message);
export const conflict = (message: string, fields?: Record<string, string>) => new AppError("CONFLICT", message, fields);
export const badRequest = (message: string, fields?: Record<string, string>) =>
  new AppError("BAD_REQUEST", message, fields);
export const validationError = (message: string, fields?: Record<string, string>) =>
  new AppError("VALIDATION_ERROR", message, fields);
