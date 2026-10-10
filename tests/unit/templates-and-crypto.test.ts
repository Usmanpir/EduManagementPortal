import { describe, expect, it } from "vitest";
import { renderTemplate } from "@/server/modules/communication/templates";
import { decryptJson, encryptJson, hashToken } from "@/server/auth/crypto";
import { parseOrgSettings } from "@/server/modules/organizations/settings";

describe("message templates", () => {
  it("escapes user-controlled values in HTML emails", () => {
    const r = renderTemplate("attendance_absent", { studentName: "<script>alert(1)</script>", sectionName: "10-A", date: "2 Oct" });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
  });

  it("produces a short form for SMS/WhatsApp", () => {
    const r = renderTemplate("attendance_absent", { studentName: "Muhammad Ali", sectionName: "10-A", date: "2 Oct 2026", organizationName: "Demo School" });
    expect(r.short).toBe("Demo School: Your child Muhammad Ali was marked absent today (2 Oct 2026).");
  });
});

describe("credential encryption", () => {
  it("round-trips JSON and detects tampering", () => {
    const sealed = encryptJson({ accessToken: "secret-token" });
    expect(sealed).not.toContain("secret-token");
    expect(decryptJson<{ accessToken: string }>(sealed).accessToken).toBe("secret-token");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptJson(parts.join("."))).toThrow();
  });

  it("hashes tokens deterministically", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe("abc");
  });
});

describe("organization settings", () => {
  it("falls back to defaults for corrupt settings", () => {
    const s = parseOrgSettings({ attendance: { lowAttendanceThreshold: "not-a-number" } });
    expect(s.attendance.lowAttendanceThreshold).toBe(75);
  });

  it("fills missing sections with defaults", () => {
    const s = parseOrgSettings({ attendance: { mode: "PERIOD" } });
    expect(s.attendance.mode).toBe("PERIOD");
    expect(s.exams.gradingScale.length).toBeGreaterThan(0);
  });
});
