import "server-only";
import ExcelJS from "exceljs";

export type Row = Record<string, string | number | null | undefined>;

/**
 * Spreadsheet apps execute cells that start with = + - @ (and tab/CR) as
 * formulas. Prefixing a quote keeps user-entered text inert ("CSV injection").
 */
export function neutralizeCell(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvEscape(value: string | number) {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Row[], headers?: string[]): string {
  const cols = headers ?? Object.keys(rows[0] ?? {});
  const lines = [cols.map((c) => csvEscape(c)).join(",")];
  for (const row of rows) lines.push(cols.map((c) => csvEscape(neutralizeCell(row[c]))).join(","));
  // BOM so Excel opens UTF-8 (Urdu/Arabic names) correctly.
  return `﻿${lines.join("\r\n")}`;
}

export async function toXlsx(rows: Row[], sheetName = "Export", headers?: string[]): Promise<Buffer> {
  const cols = headers ?? Object.keys(rows[0] ?? {});
  const wb = new ExcelJS.Workbook();
  wb.creator = "EduAttend";
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(12, c.length + 4)) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of rows) ws.addRow(Object.fromEntries(cols.map((c) => [c, neutralizeCell(row[c])])));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Safe, descriptive download filename like "students-2026-10-02.csv". */
export function exportFilename(base: string, ext: "csv" | "xlsx") {
  const date = new Date().toISOString().slice(0, 10);
  return `${base.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}-${date}.${ext}`;
}

export async function tabularResponse(rows: Row[], opts: { name: string; format: "csv" | "xlsx"; headers?: string[] }) {
  const filename = exportFilename(opts.name, opts.format);
  if (opts.format === "xlsx") {
    const buf = await toXlsx(rows, opts.name, opts.headers);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response(toCsv(rows, opts.headers), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
