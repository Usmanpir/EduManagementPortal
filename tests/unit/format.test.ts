import { describe, expect, it } from "vitest";
import { addDays, formatMinutes, formatMoney, isoWeekday, parseTime, percentOf, todayIn } from "@/lib/format";

describe("dates", () => {
  it("computes today in the organization's timezone, not the server's", () => {
    // 20:30 UTC on 1 Oct is already 2 Oct in Karachi (UTC+5).
    const instant = new Date("2026-10-01T20:30:00Z");
    expect(todayIn("Asia/Karachi", instant)).toBe("2026-10-02");
    expect(todayIn("UTC", instant)).toBe("2026-10-01");
  });

  it("returns ISO weekdays", () => {
    expect(isoWeekday("2026-09-28")).toBe(1); // Monday
    expect(isoWeekday("2026-10-04")).toBe(7); // Sunday
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("round-trips period times", () => {
    expect(parseTime("09:45")).toBe(585);
    expect(formatMinutes(585)).toBe("09:45");
  });
});

describe("numbers", () => {
  it("formats money with the currency code", () => {
    expect(formatMoney(12000, "PKR")).toBe("PKR 12,000");
  });

  it("guards percentages against division by zero", () => {
    expect(percentOf(3, 0)).toBeNull();
    expect(percentOf(36, 40)).toBe(90);
  });
});
