import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { badRequest } from "@/server/http/errors";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export type ParsedSheet = { fileName: string; headers: string[]; rows: Record<string, string>[] };

/** Display-only filename: strips paths, control characters and anything unusual. */
export function sanitizeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "upload";
  return base.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "upload";
}

const normalizeHeader = (h: string) => h.replace(/^﻿/, "").trim();

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    return "";
  }
  return String(value);
}

/**
 * Parses an uploaded CSV or XLSX into string rows. Validates size, type and
 * content signature; never trusts the browser-provided MIME type alone.
 */
export async function parseUpload(file: File): Promise<ParsedSheet> {
  const fileName = sanitizeFileName(file.name);
  if (file.size === 0) throw badRequest("The file is empty.");
  if (file.size > MAX_IMPORT_BYTES) throw badRequest("Files can be up to 5 MB. Split larger lists into several files.");
  const ext = fileName.toLowerCase().split(".").pop();
  const bytes = Buffer.from(await file.arrayBuffer());

  let headers: string[] = [];
  let rows: Record<string, string>[] = [];

  if (ext === "csv") {
    if (bytes.subarray(0, 4096).includes(0)) throw badRequest("This doesn't look like a text CSV file.");
    const parsed = Papa.parse<Record<string, string>>(bytes.toString("utf8"), {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: normalizeHeader,
    });
    headers = (parsed.meta.fields ?? []).filter(Boolean);
    rows = parsed.data;
  } else if (ext === "xlsx") {
    // XLSX files are ZIP archives: they must start with "PK".
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw badRequest("This doesn't look like a valid Excel (.xlsx) file.");
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    } catch {
      throw badRequest("We couldn't read this Excel file. Save it again as .xlsx or export it as CSV.");
    }
    const ws = wb.worksheets[0];
    if (!ws) throw badRequest("The Excel file has no sheets.");
    const headerRow = ws.getRow(1);
    const colCount = headerRow.cellCount;
    headers = Array.from({ length: colCount }, (_, i) => normalizeHeader(cellText(headerRow.getCell(i + 1).value)));
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const record: Record<string, string> = {};
      let any = false;
      headers.forEach((h, i) => {
        if (!h) return;
        const v = cellText(row.getCell(i + 1).value).trim();
        if (v) any = true;
        record[h] = v;
      });
      if (any) rows.push(record);
    });
    headers = headers.filter(Boolean);
  } else {
    throw badRequest("Upload a .csv or .xlsx file.");
  }

  if (headers.length === 0) throw badRequest("The first row must contain column headings. Download the template to see the format.");
  if (rows.length === 0) throw badRequest("The file has headings but no rows.");
  if (rows.length > MAX_IMPORT_ROWS) throw badRequest(`Imports are limited to ${MAX_IMPORT_ROWS.toLocaleString()} rows per file.`);

  rows = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "").trim()])));
  return { fileName, headers, rows };
}

/** Finds a value by any of several accepted header spellings (case/space-insensitive). */
export function pick(row: Record<string, string>, ...aliases: string[]): string {
  const want = aliases.map((a) => a.toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (const [k, v] of Object.entries(row)) {
    if (want.includes(k.toLowerCase().replace(/[^a-z0-9]/g, ""))) return v?.trim() ?? "";
  }
  return "";
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY and DD-MM-YYYY. Returns null for blank, "invalid" for unparseable. */
export function parseDateCell(v: string): string | null | "invalid" {
  if (!v) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
    if (!m) return "invalid";
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return "invalid";
  return date.toISOString().slice(0, 10);
}

export function parseGender(v: string): "MALE" | "FEMALE" | "OTHER" | null | "invalid" {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (["m", "male", "boy"].includes(s)) return "MALE";
  if (["f", "female", "girl"].includes(s)) return "FEMALE";
  if (["o", "other"].includes(s)) return "OTHER";
  return "invalid";
}
