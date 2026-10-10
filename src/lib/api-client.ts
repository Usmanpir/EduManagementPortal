import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(code: string, message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

type Envelope<T> =
  | { success: true; data: T; message: string }
  | { success: false; error: { code: string; message: string; fields?: Record<string, string> } };

async function request<T>(method: string, url: string, body?: unknown, init?: RequestInit): Promise<{ data: T; message: string }> {
  let res: Response;
  const isForm = body instanceof FormData;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      // The browser sets the multipart boundary itself for FormData.
      headers: body !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      ...init,
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "We couldn't reach EduAttend. Check your connection and try again.", 0);
  }

  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    // fall through
  }
  if (!json) throw new ApiError("INTERNAL_ERROR", "Something went wrong on our side. Please try again.", res.status);
  if (!json.success) throw new ApiError(json.error.code, json.error.message, res.status, json.error.fields);
  return { data: json.data, message: json.message };
}

export const api = {
  get: <T>(url: string, init?: RequestInit) => request<T>("GET", url, undefined, init),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body ?? {}),
  delete: <T>(url: string, body?: unknown) => request<T>("DELETE", url, body),
  upload: <T>(url: string, form: FormData) => request<T>("POST", url, form),
};

/**
 * Maps server field errors onto a react-hook-form instance.
 * Returns true when at least one field error was applied.
 */
export function applyFieldErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>): boolean {
  if (!(error instanceof ApiError) || !error.fields) return false;
  let applied = false;
  for (const [field, message] of Object.entries(error.fields)) {
    if (field === "_") continue;
    setError(field as Path<T>, { type: "server", message });
    applied = true;
  }
  return applied;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Please try again.";
}
