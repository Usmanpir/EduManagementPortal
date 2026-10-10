"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FormAlert } from "@/components/common/form-alert";
import { api, errorMessage } from "@/lib/api-client";

type RowError = { field: string; message: string };
type PreviewRow = { rowNumber: number; values: Record<string, string>; errors: RowError[] };
type Preview = { fileName: string; headers: string[]; rows: PreviewRow[]; summary: { total: number; valid: number; invalid: number } };
type Result = { imported: number; failed: number; errors: { row: number; field: string; message: string }[] };

const STEPS = ["Upload", "Review", "Import"];

function Steps({ current }: { current: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Import progress">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "grid size-6 place-items-center rounded-full text-caption font-semibold tabular",
              i < current ? "bg-success text-on-success" : i === current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {i < current ? "✓" : i + 1}
          </span>
          <span className={cn("text-small", i === current ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
          {i < STEPS.length - 1 && <span aria-hidden className="mx-1 h-px w-6 bg-border sm:w-12" />}
        </li>
      ))}
    </ol>
  );
}

function csvCell(v: string) {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Client-side "download errors" file: the failed rows plus what went wrong. */
function downloadErrors(rows: PreviewRow[], errors: Result["errors"], headers: string[], name: string) {
  const byRow = new Map<number, string[]>();
  for (const e of errors) byRow.set(e.row, [...(byRow.get(e.row) ?? []), e.field ? `${e.field}: ${e.message}` : e.message]);
  const failed = rows.filter((r) => byRow.has(r.rowNumber));
  const lines = [[...headers, "Errors"].map(csvCell).join(",")];
  for (const r of failed) lines.push([...headers.map((h) => r.values[h] ?? ""), byRow.get(r.rowNumber)!.join("; ")].map(csvCell).join(","));
  const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `${name}-import-errors.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportWizard({ type, noun, backHref, description }: { type: "students" | "staff" | "teachers"; noun: string; backHref: string; description: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const { data } = await api.upload<Preview>(`/api/imports/${type}/preview`, form);
      setPreview(data);
      setEdits({});
      setOnlyProblems(data.summary.invalid > 0);
      setStep(1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const rows = useMemo(
    () => (preview?.rows ?? []).map((r) => ({ ...r, values: { ...r.values, ...edits[r.rowNumber] }, edited: !!edits[r.rowNumber] })),
    [preview, edits],
  );
  const visible = onlyProblems ? rows.filter((r) => r.errors.length > 0) : rows;

  const revalidate = async () => {
    if (!preview) return;
    // Re-run validation on the corrected rows without importing anything.
    setBusy(true);
    try {
      const { data } = await api.post<Pick<Preview, "rows" | "summary">>(`/api/imports/${type}/validate`, {
        rows: rows.map((r) => ({ rowNumber: r.rowNumber, values: r.values })),
      });
      setPreview({ ...preview, rows: data.rows, summary: data.summary });
      setEdits({});
      toast.success(data.summary.invalid ? `${data.summary.invalid} rows still need attention.` : "All rows look good.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<Result>(`/api/imports/${type}/commit`, {
        fileName: preview.fileName,
        rows: rows.map((r) => ({ rowNumber: r.rowNumber, values: r.values })),
      });
      setResult(data);
      setStep(2);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setPreview(null);
    setResult(null);
    setEdits({});
    setStep(0);
    setError(null);
  };

  const errorFor = (r: PreviewRow, header: string) => r.errors.find((e) => e.field === header)?.message;
  const editedCount = Object.keys(edits).length;
  const validCount = rows.filter((r) => r.errors.length === 0).length;

  return (
    <div className="flex flex-col">
      <Steps current={step} />
      <FormAlert className="mb-4">{error}</FormAlert>

      {step === 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs">
            <span className="grid size-10 place-items-center rounded-lg bg-success-subtle text-success-foreground">
              <FileSpreadsheet className="size-5" />
            </span>
            <h2 className="text-h3">1. Get the template</h2>
            <p className="text-small text-muted-foreground">{description}</p>
            <div className="mt-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/imports/${type}/template?format=xlsx`}>
                  <Download /> Excel template
                </a>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <a href={`/api/imports/${type}/template?format=csv`}>CSV</a>
              </Button>
            </div>
          </section>
          <section className="lg:col-span-2">
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload your file"
              aria-busy={busy}
              onClick={() => !busy && inputRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void upload(e.dataTransfer.files[0]);
              }}
              className={cn(
                "flex h-full min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                dragging ? "border-primary bg-primary-subtle/40" : "border-border-strong hover:bg-muted/30",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <span className="grid size-12 place-items-center rounded-xl bg-primary-subtle text-primary-subtle-foreground">
                <Upload className="size-6" />
              </span>
              <div>
                <p className="text-h3">{busy ? "Checking your file…" : "2. Drop your filled-in file here"}</p>
                <p className="text-small text-muted-foreground">Excel (.xlsx) or CSV, up to 5 MB and 5,000 rows. Nothing is saved until you confirm.</p>
              </div>
              <Button type="button" variant="outline" loading={busy} tabIndex={-1}>
                Choose file
              </Button>
              <input ref={inputRef} type="file" accept=".csv,.xlsx" className="sr-only" tabIndex={-1} onChange={(e) => upload(e.target.files?.[0])} />
            </div>
          </section>
        </div>
      )}

      {step === 1 && preview && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-xs">
            <FileSpreadsheet className="size-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{preview.fileName}</p>
              <p className="text-small text-muted-foreground">
                {preview.summary.total} rows · <span className="text-success-foreground">{validCount} ready</span>
                {preview.summary.invalid > 0 && (
                  <>
                    {" "}
                    · <span className="text-danger-foreground">{rows.length - validCount} need attention</span>
                  </>
                )}
              </p>
            </div>
            <label className="flex items-center gap-2 text-small">
              <Switch checked={onlyProblems} onCheckedChange={setOnlyProblems} /> Only rows with problems
            </label>
            <Button variant="ghost" onClick={reset}>
              <RotateCcw /> Start over
            </Button>
          </div>

          {visible.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success-subtle px-4 py-3 text-success-foreground">
              <CircleCheck className="size-5" />
              <p className="text-small font-medium">Every row passed validation. You&apos;re ready to import.</p>
            </div>
          ) : (
            <div data-scroll-area className="overflow-auto rounded-xl border bg-card shadow-xs md:max-h-[calc(100dvh-22rem)]">
              <table className="w-full text-small">
                <thead className="sticky top-0 z-1 bg-muted/90 backdrop-blur">
                  <tr className="border-b">
                    <th scope="col" className="h-9 px-3 text-start text-caption font-medium text-muted-foreground">
                      Row
                    </th>
                    {preview.headers.map((h) => (
                      <th key={h} scope="col" className="h-9 px-3 text-start text-caption font-medium whitespace-nowrap text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.rowNumber} className={cn("border-b align-top last:border-0", r.errors.length && "bg-danger-subtle/30")}>
                      <th scope="row" className="px-3 py-2 text-start font-normal">
                        <span className="flex items-center gap-1.5 tabular">
                          {r.errors.length ? <CircleAlert className="size-3.5 text-danger" aria-label="Has problems" /> : <CircleCheck className="size-3.5 text-success" aria-label="Valid" />}
                          {r.rowNumber}
                        </span>
                      </th>
                      {preview.headers.map((h) => {
                        const err = errorFor(r, h);
                        return (
                          <td key={h} className="min-w-32 px-1.5 py-1">
                            <input
                              aria-label={`Row ${r.rowNumber} ${h}`}
                              aria-invalid={err ? true : undefined}
                              value={r.values[h] ?? ""}
                              onChange={(e) => setEdits((prev) => ({ ...prev, [r.rowNumber]: { ...prev[r.rowNumber], [h]: e.target.value } }))}
                              className={cn(
                                "h-8 w-full rounded-sm border border-transparent bg-transparent px-1.5 outline-none hover:border-border focus:border-primary focus:bg-card",
                                err && "border-danger/50 bg-card",
                              )}
                            />
                            {err && <p className="px-1.5 pt-0.5 text-caption text-danger-foreground">{err}</p>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="sticky bottom-20 z-(--z-sticky) flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-popover p-3 shadow-lg md:bottom-4">
            <p className="me-auto text-small text-muted-foreground">
              {editedCount > 0 ? `${editedCount} rows edited — check them again before importing.` : rows.length - validCount > 0 ? "Invalid rows are skipped. Fix them above or import the valid ones now." : `${validCount} ${noun} will be added.`}
            </p>
            {editedCount > 0 && (
              <Button variant="outline" onClick={revalidate} loading={busy}>
                Check again
              </Button>
            )}
            <Button onClick={commit} loading={busy} disabled={validCount === 0 || editedCount > 0}>
              Import {validCount} {noun}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && result && preview && (
        <div className="mx-auto flex w-full max-w-xl animate-pop flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-xs">
          <span className="grid size-14 place-items-center rounded-full bg-success-subtle text-success-foreground">
            <CircleCheck className="size-7" />
          </span>
          <div>
            <h2 className="text-h1">Import complete</h2>
            <p className="text-muted-foreground">from {preview.fileName}</p>
          </div>
          <div className="flex gap-3">
            <Badge variant="success" className="h-8 px-3 text-small">
              {result.imported} imported
            </Badge>
            {result.failed > 0 && (
              <Badge variant="danger" className="h-8 px-3 text-small">
                {result.failed} failed
              </Badge>
            )}
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {result.failed > 0 && (
              <Button variant="outline" onClick={() => downloadErrors(rows, result.errors, preview.headers, type)}>
                <Download /> Download errors
              </Button>
            )}
            <Button variant="outline" onClick={reset}>
              Import another file
            </Button>
            <Button asChild>
              <Link href={backHref}>View {noun}</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
