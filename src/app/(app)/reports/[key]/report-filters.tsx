"use client";

import { Download, Printer } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { OptionSelect } from "@/components/common/option-select";
import { useUrlState } from "@/components/data/use-url-state";
import { addDays } from "@/lib/format";
import type { ReportMeta } from "@/lib/reports";
import { DatePicker, MonthPicker } from "@/components/common/date-pickers";

type Option = { value: string; label: string };
type Options = { classes: Option[]; sections: (Option & { classId: string })[]; exams: Option[] };
type Values = { from: string; to: string; month: string; classId?: string; sectionId?: string; examId?: string; method?: string; status?: string; limit: number };

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "MOBILE_WALLET", label: "Mobile wallet" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CARD", label: "Card" },
  { value: "ONLINE", label: "Online" },
  { value: "OTHER", label: "Other" },
];
const STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "GRADUATED", label: "Graduated" },
  { value: "TRANSFERRED", label: "Transferred" },
];

function Labeled({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-caption font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** URL-driven filters for any report; changing one re-runs the report on the server. */
export function ReportFilters({ meta, values, today, options, exportQuery, canExport }: { meta: ReportMeta; values: Values; today: string; options: Options; exportQuery: string | null; canExport: boolean }) {
  const { set, pending } = useUrlState();
  const has = (f: ReportMeta["filters"][number]) => meta.filters.includes(f);
  const sections = options.sections.filter((s) => !values.classId || s.classId === values.classId);
  const year = today.slice(0, 4);
  const presets = [
    { label: "30 days", from: addDays(today, -29) },
    { label: "This month", from: `${today.slice(0, 7)}-01` },
    { label: "This year", from: `${year}-01-01` },
  ];

  return (
    <div className={cn("flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-xs", pending && "opacity-70")} aria-busy={pending}>
      {has("dateRange") && (
        <>
          <div role="group" aria-label="Quick range" className="flex gap-1 rounded-lg bg-muted p-1">
            {presets.map((p) => {
              const active = values.from === p.from && values.to === today;
              return (
                <button key={p.label} type="button" aria-pressed={active} onClick={() => set({ from: p.from, to: today })} className={cn("rounded-md px-2.5 py-1 text-small font-medium", active ? "bg-card shadow-xs" : "text-muted-foreground hover:text-foreground")}>
                  {p.label}
                </button>
              );
            })}
          </div>
          <Labeled label="From">
            <DatePicker ariaLabel="From" value={values.from} max={values.to} onChange={(v) => v && set({ from: v })} className="w-[10.5rem]" />
          </Labeled>
          <Labeled label="To">
            <DatePicker ariaLabel="To" value={values.to} max={today} onChange={(v) => v && set({ to: v })} className="w-[10.5rem]" />
          </Labeled>
        </>
      )}
      {has("month") && (
        <Labeled label="Month">
          <MonthPicker ariaLabel="Month" value={values.month} max={today.slice(0, 7)} onChange={(v) => v && set({ month: v })} className="w-44" />
        </Labeled>
      )}
      {has("exam") && (
        <Labeled label="Exam" className="w-64">
          <OptionSelect ariaLabel="Exam" value={values.examId ?? null} onChange={(v) => set({ examId: v })} options={options.exams} />
        </Labeled>
      )}
      {has("class") && (
        <Labeled label="Class" className="w-44">
          <OptionSelect ariaLabel="Class" value={values.classId ?? null} onChange={(v) => set({ classId: v, sectionId: null })} options={options.classes} noneLabel="All classes" />
        </Labeled>
      )}
      {has("section") && (
        <Labeled label="Section" className="w-48">
          <OptionSelect ariaLabel="Section" value={values.sectionId ?? null} onChange={(v) => set({ sectionId: v })} options={sections} noneLabel={meta.required?.includes("section") ? undefined : "All sections"} />
        </Labeled>
      )}
      {has("method") && (
        <Labeled label="Method" className="w-44">
          <OptionSelect ariaLabel="Payment method" value={values.method ?? null} onChange={(v) => set({ method: v })} options={METHODS} noneLabel="All methods" />
        </Labeled>
      )}
      {has("studentStatus") && (
        <Labeled label="Status" className="w-40">
          <OptionSelect ariaLabel="Student status" value={values.status ?? "ACTIVE"} onChange={(v) => set({ status: v === "ACTIVE" ? null : v })} options={STATUSES} />
        </Labeled>
      )}
      {has("limit") && (
        <Labeled label="Top" className="w-28">
          <OptionSelect ariaLabel="How many" value={String(values.limit)} onChange={(v) => set({ limit: v })} options={["3", "5", "10"].map((n) => ({ value: n, label: `Top ${n}` }))} />
        </Labeled>
      )}
      {exportQuery !== null && (
        <div className="ms-auto flex gap-2">
          <Button variant="outline" asChild>
            <a href={`/reports/print/${meta.key}?${exportQuery}`} target="_blank" rel="noreferrer">
              <Printer /> Print
            </a>
          </Button>
          {canExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Download /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={`/api/reports/${meta.key}?${exportQuery}&format=xlsx`}>Excel (.xlsx)</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/reports/${meta.key}?${exportQuery}&format=csv`}>CSV</a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}
