import "server-only";

type Level = "debug" | "info" | "warn" | "error";

const REDACT = /pass(word)?|secret|token|authorization|cookie|api[_-]?key|credential/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = REDACT.test(k) ? "[redacted]" : sanitize(v, depth + 1);
    return out;
  }
  return value;
}

function write(level: Level, event: string, data?: Record<string, unknown>) {
  const entry = { level, event, time: new Date().toISOString(), ...(data ? (sanitize(data) as object) : {}) };
  // Structured JSON in production for log aggregation; readable output locally.
  const line = process.env.NODE_ENV === "production" ? JSON.stringify(entry) : entry;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "info") console.info(line);
  else if (process.env.NODE_ENV !== "production") console.debug(line);
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => write("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) => write("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => write("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => write("error", event, data),
};
