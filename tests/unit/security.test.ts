import { describe, expect, it } from "vitest";
import { detectFileType } from "@/server/modules/documents/service";
import { neutralizeCell, toCsv } from "@/server/export/tabular";
import { signedFileUrl, verifyFileSignature } from "@/server/storage/urls";
import { assertValidKey } from "@/server/storage";
import { toErrorResponse } from "@/server/http/api";
import { AppError } from "@/server/http/errors";

const pdf = Buffer.from("%PDF-1.7\n...");
const exe = Buffer.from("MZ\x90\x00\x03\x00\x00\x00");
const html = Buffer.from("<html><script>alert(1)</script></html>");

describe("upload type checks", () => {
  it("trusts the file's bytes, not its name", () => {
    expect(detectFileType("report.pdf", pdf)?.mime).toBe("application/pdf");
    expect(detectFileType("report.pdf", exe)).toBeNull();
    expect(detectFileType("photo.png", html)).toBeNull();
    expect(detectFileType("evil.html", html)).toBeNull();
    expect(detectFileType("report.exe", exe)).toBeNull();
  });
});

describe("signed file links", () => {
  const parse = (url: string) => new URL(url, "http://x").searchParams;
  it("accept only the exact key, expiry and download name they were signed for", () => {
    const url = signedFileUrl("org/a/doc.pdf", 900);
    const p = parse(url);
    expect(verifyFileSignature("org/a/doc.pdf", p.get("exp"), p.get("sig"), null)).toBe(true);
    // Another school's file with a borrowed signature.
    expect(verifyFileSignature("org/b/doc.pdf", p.get("exp"), p.get("sig"), null)).toBe(false);
    // Extending the expiry.
    expect(verifyFileSignature("org/a/doc.pdf", String(Number(p.get("exp")) + 86400), p.get("sig"), null)).toBe(false);
    // Turning a view link into a download with a chosen filename.
    expect(verifyFileSignature("org/a/doc.pdf", p.get("exp"), p.get("sig"), "x.html")).toBe(false);
    expect(verifyFileSignature("org/a/doc.pdf", p.get("exp"), null, null)).toBe(false);
  });

  it("expire", () => {
    const past = String(Math.floor(Date.now() / 1000) - 10);
    expect(verifyFileSignature("org/a/doc.pdf", past, "anything", null)).toBe(false);
  });

  it("refuse path traversal in storage keys", () => {
    expect(() => assertValidKey("org/a/../../etc/passwd")).toThrow();
    expect(() => assertValidKey("../secret")).toThrow();
    expect(() => assertValidKey("org/a/doc.pdf")).not.toThrow();
  });
});

describe("error responses", () => {
  it("never expose internal error details", async () => {
    const res = toErrorResponse(new Error("connect ECONNREFUSED postgres://admin:hunter2@db:5432"));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/hunter2|ECONNREFUSED|postgres|stack/i);
    expect(body).toEqual({ success: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side. Please try again." } });
  });

  it("pass through deliberate, user-facing errors", async () => {
    const res = toErrorResponse(new AppError("NOT_FOUND", "Student not found."));
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toBe("Student not found.");
  });
});

describe("spreadsheet exports", () => {
  it("neutralise formula injection", () => {
    expect(neutralizeCell("=HYPERLINK(\"http://evil\")")).toBe("'=HYPERLINK(\"http://evil\")");
    expect(neutralizeCell("+92 300 1234567")).toBe("'+92 300 1234567");
    expect(neutralizeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(neutralizeCell(42)).toBe(42);
    expect(toCsv([{ Name: "-2+3" }])).toContain("'-2+3");
  });
});
