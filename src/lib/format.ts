import { formatInTimeZone, toZonedTime } from "date-fns-tz";

/** "YYYY-MM-DD" for "today" in the organization's timezone (not the server's). */
export function todayIn(timezone: string, now = new Date()): string {
  return formatInTimeZone(now, timezone, "yyyy-MM-dd");
}

/** Minutes since midnight in a timezone. */
export function minuteIn(timezone: string, now = new Date()): number {
  const z = toZonedTime(now, timezone);
  return z.getHours() * 60 + z.getMinutes();
}

/** Hour of day (0–23) in a timezone. */
export function hourIn(timezone: string, now = new Date()): number {
  return toZonedTime(now, timezone).getHours();
}

/** ISO weekday (1 = Monday … 7 = Sunday) for a "YYYY-MM-DD" date. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Converts "YYYY-MM-DD" to the UTC-midnight Date used for @db.Date columns. */
export function dateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Converts a @db.Date value back to "YYYY-MM-DD". */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = dateOnly(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

export function greetingKey(hour: number): "greeting.morning" | "greeting.afternoon" | "greeting.evening" {
  if (hour < 12) return "greeting.morning";
  if (hour < 17) return "greeting.afternoon";
  return "greeting.evening";
}

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const weekdayLong = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** Formats a date-only value ("YYYY-MM-DD" or UTC-midnight Date). */
export function formatDate(value: string | Date | null | undefined, style: "long" | "short" | "dayMonth" | "weekday" = "short"): string {
  if (!value) return "—";
  const d = typeof value === "string" ? dateOnly(value.slice(0, 10)) : value;
  const f = style === "long" ? longDate : style === "dayMonth" ? dayMonth : style === "weekday" ? weekdayLong : shortDate;
  return f.format(d);
}

/** Formats an instant in the organization's timezone. */
export function formatDateTime(value: Date | string, timezone: string): string {
  return formatInTimeZone(new Date(value), timezone, "d MMM yyyy, HH:mm");
}

/** Minutes from midnight → "09:45". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "09:45" → minutes from midnight. */
export function parseTime(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number | string | null | undefined, currency = "PKR", opts: { compact?: boolean } = {}): string {
  const value = Number(amount ?? 0);
  const key = `${currency}:${opts.compact ? "c" : "f"}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-PK", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      maximumFractionDigits: opts.compact ? 1 : value % 1 === 0 ? 0 : 2,
      minimumFractionDigits: 0,
      notation: opts.compact ? "compact" : "standard",
    });
    moneyFormatters.set(key, f);
  }
  return f.format(value).replace(/ /g, " ");
}

const integer = new Intl.NumberFormat("en-US");
export function formatNumber(value: number | null | undefined): string {
  return integer.format(value ?? 0);
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function percentOf(part: number, total: number): number | null {
  return total > 0 ? (part / total) * 100 : null;
}

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}
