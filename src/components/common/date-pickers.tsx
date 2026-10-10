"use client";

import * as React from "react";
import { format as formatFns, parse } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import type { DropdownProps } from "react-day-picker";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/format";

/*
 * Date, time and month pickers that replace the browser's native controls, so they
 * look the same in every browser and theme. Values stay plain strings, exactly what
 * the native inputs produced: "YYYY-MM-DD", "HH:MM" (24h) and "YYYY-MM".
 */

const triggerClass =
  "flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-card px-3 text-start text-sm shadow-xs transition-[border-color,box-shadow] duration-150 outline-none hover:border-border-strong focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 data-[invalid=true]:border-danger data-[invalid=true]:ring-3 data-[invalid=true]:ring-danger/15 data-[state=open]:border-primary data-[state=open]:ring-3 data-[state=open]:ring-ring/40 dark:bg-input/20 dark:data-[invalid=true]:ring-danger/30";

type TriggerProps = Omit<React.ComponentProps<"button">, "value" | "onChange" | "type" | "children">;

type PickerProps = TriggerProps & {
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Shows a clear (×) button; clearing calls onChange(""). */
  clearable?: boolean;
  invalid?: boolean;
  /** Accessible name when no <label> points at the trigger. */
  ariaLabel?: string;
};

function PickerTrigger({
  icon: Icon,
  display,
  placeholder,
  invalid,
  ariaLabel,
  onClear,
  className,
  "aria-invalid": ariaInvalid,
  ...rest
}: TriggerProps & { icon: typeof CalendarDays; display: string | null; placeholder: string; invalid?: boolean; ariaLabel?: string; onClear?: () => void }) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel ? (display ? `${ariaLabel}: ${display}` : ariaLabel) : undefined}
          {...rest}
          // Buttons can't carry aria-invalid; the error text is linked via aria-describedby instead.
          data-invalid={invalid || !!ariaInvalid || undefined}
          className={cn(triggerClass, onClear && display && "pe-8")}
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className={cn("min-w-0 flex-1 truncate tabular", !display && "text-subtle-foreground")}>{display ?? placeholder}</span>
        </button>
      </PopoverTrigger>
      {onClear && display && !rest.disabled && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear"
          className="absolute inset-y-0 end-1.5 my-auto grid size-6 place-items-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

const toDate = (value: string | null | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parse(value, "yyyy-MM-dd", new Date(2000, 0, 1)) : undefined);
const toValue = (date: Date) => formatFns(date, "yyyy-MM-dd");

/** Month/year dropdowns inside the calendar header — styled selects instead of native ones. */
function CalendarDropdown({ options, value, onChange, "aria-label": ariaLabel }: DropdownProps) {
  return (
    <Select
      value={value === undefined ? undefined : String(value)}
      onValueChange={(v) => onChange?.({ target: { value: v } } as React.ChangeEvent<HTMLSelectElement>)}
    >
      <SelectTrigger size="sm" aria-label={ariaLabel} className="h-7 w-auto gap-1 border-transparent bg-transparent px-2 font-medium shadow-none hover:bg-muted dark:bg-transparent">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-64 min-w-24">
        {options?.map((o) => (
          <SelectItem key={o.value} value={String(o.value)} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type DatePickerProps = PickerProps & {
  /** Earliest / latest selectable day, "YYYY-MM-DD". */
  min?: string;
  max?: string;
};

export function DatePicker({ value, onChange, min, max, placeholder = "Pick a date", clearable, invalid, ariaLabel, className, ...props }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = toDate(value);
  const minDate = toDate(min);
  const maxDate = toDate(max);
  // Month/year dropdowns cover a wide range so dates of birth are quick to reach.
  const [thisYear] = React.useState(() => new Date().getFullYear());
  const startMonth = minDate ?? new Date(thisYear - 80, 0, 1);
  const endMonth = maxDate ?? new Date(thisYear + 5, 11, 31);
  const disabled = [...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])];

  const pick = (date: Date | undefined) => {
    if (!date) return;
    onChange(toValue(date));
    setOpen(false);
  };
  const today = () => {
    const now = new Date();
    if ((minDate && now < minDate) || (maxDate && toValue(now) > max!)) return;
    pick(now);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PickerTrigger
        icon={CalendarDays}
        display={value ? formatDate(value, "short") : null}
        placeholder={placeholder}
        invalid={invalid}
        ariaLabel={ariaLabel}
        onClear={clearable ? () => onChange("") : undefined}
        className={className}
        {...props}
      />
      <PopoverContent align="start" className="z-(--z-popover) w-auto gap-0 p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={pick}
          defaultMonth={selected ?? maxDate}
          startMonth={startMonth}
          endMonth={endMonth}
          disabled={disabled}
          captionLayout="dropdown"
          weekStartsOn={1}
          autoFocus
          components={{ Dropdown: CalendarDropdown }}
          className="p-3 [--cell-size:--spacing(9)]"
        />
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={today}>
            Today
          </Button>
          {clearable && value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "14:05" → "2:05 PM" */
export function formatTime12(value: string | null | undefined): string | null {
  if (!value || !/^\d{2}:\d{2}/.test(value)) return null;
  const [h, m] = value.split(":").map(Number) as [number, number];
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

function Column({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="listbox" aria-label={label} className="no-scrollbar relative flex max-h-56 w-16 snap-y flex-col gap-0.5 overflow-y-auto p-1">
      {children}
    </div>
  );
}

function Cell({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  const ref = React.useRef<HTMLButtonElement>(null);
  // Centre the current value in its column when the picker opens (without scrolling the page).
  React.useEffect(() => {
    const el = ref.current;
    const column = el?.parentElement;
    if (selected && el && column) column.scrollTop = el.offsetTop - column.clientHeight / 2 + el.clientHeight / 2;
  }, [selected]);
  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "h-8 shrink-0 snap-center rounded-md text-sm tabular transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "bg-primary font-semibold text-primary-foreground" : "text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

export type TimePickerProps = PickerProps & {
  /** Minute increments offered (default 5). The current value is always offered too. */
  step?: number;
  /** Used for the first pick when empty (default "08:00"). */
  defaultTime?: string;
  /** Adds a "Now" button. */
  showNow?: boolean;
};

export function TimePicker({ value, onChange, step = 5, defaultTime = "08:00", showNow, placeholder = "Set time", clearable, invalid, ariaLabel, className, ...props }: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const current = value && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : null;
  const [h24, minute] = (current ?? defaultTime).split(":").map(Number) as [number, number];
  const hour12 = h24 % 12 || 12;
  const pm = h24 >= 12;
  const steps = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step);
  const minutes = current && !steps.includes(minute) ? [...steps, minute].sort((a, b) => a - b) : steps;

  const set = (next: { hour12?: number; minute?: number; pm?: boolean }) => {
    const h = next.hour12 ?? hour12;
    const isPm = next.pm ?? pm;
    onChange(`${pad((h % 12) + (isPm ? 12 : 0))}:${pad(next.minute ?? minute)}`);
  };
  const now = () => {
    const d = new Date();
    onChange(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PickerTrigger
        icon={Clock}
        display={formatTime12(current)}
        placeholder={placeholder}
        invalid={invalid}
        ariaLabel={ariaLabel}
        onClear={clearable ? () => onChange("") : undefined}
        className={className}
        {...props}
      />
      <PopoverContent align="start" className="z-(--z-popover) w-auto gap-0 p-0">
        <div className="flex divide-x">
          <Column label="Hour">
            {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
              <Cell key={h} selected={!!current && h === hour12} onClick={() => set({ hour12: h })}>
                {h}
              </Cell>
            ))}
          </Column>
          <Column label="Minute">
            {minutes.map((m) => (
              <Cell key={m} selected={!!current && m === minute} onClick={() => set({ minute: m })}>
                {pad(m)}
              </Cell>
            ))}
          </Column>
          <Column label="AM or PM">
            {[false, true].map((p) => (
              <Cell key={String(p)} selected={!!current && p === pm} onClick={() => set({ pm: p })}>
                {p ? "PM" : "AM"}
              </Cell>
            ))}
          </Column>
        </div>
        <div className="flex items-center gap-1 border-t px-2 py-2">
          {showNow && (
            <Button type="button" variant="ghost" size="sm" onClick={now}>
              Now
            </Button>
          )}
          {clearable && current && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
          )}
          <Button type="button" size="sm" className="ms-auto" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type MonthPickerProps = PickerProps & {
  /** Earliest / latest selectable month, "YYYY-MM". */
  min?: string;
  max?: string;
};

export function MonthPicker({ value, onChange, min, max, placeholder = "Pick a month", clearable, invalid, ariaLabel, className, ...props }: MonthPickerProps) {
  const [open, setOpen] = React.useState(false);
  const current = value && /^\d{4}-\d{2}$/.test(value) ? value : null;
  const [thisYear] = React.useState(() => new Date().getFullYear());
  const [year, setYear] = React.useState(() => (current ? Number(current.slice(0, 4)) : thisYear));
  const display = current ? `${new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date(2000, Number(current.slice(5)) - 1, 1))} ${current.slice(0, 4)}` : null;
  const key = (m: number) => `${year}-${pad(m + 1)}`;
  const outOfRange = (k: string) => (!!min && k < min) || (!!max && k > max);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && current) setYear(Number(current.slice(0, 4)));
      }}
    >
      <PickerTrigger icon={CalendarDays} display={display} placeholder={placeholder} invalid={invalid} ariaLabel={ariaLabel} onClear={clearable ? () => onChange("") : undefined} className={className} {...props} />
      <PopoverContent align="start" className="z-(--z-popover) w-64 gap-2 p-3">
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous year" disabled={!!min && `${year - 1}-12` < min} onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          <span className="text-sm font-semibold tabular">{year}</span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Next year" disabled={!!max && `${year + 1}-01` > max} onClick={() => setYear((y) => y + 1)}>
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((label, m) => {
            const k = key(m);
            const selected = k === current;
            return (
              <button
                key={k}
                type="button"
                disabled={outOfRange(k)}
                aria-pressed={selected}
                onClick={() => {
                  onChange(k);
                  setOpen(false);
                }}
                className={cn(
                  "h-9 rounded-md text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
                  selected ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

type FormPickerProps<T extends FieldValues, P> = Omit<P, "value" | "onChange"> & { control: Control<T>; name: FieldPath<T> };

/** DatePicker bound to a react-hook-form field (drop-in for `<Input type="date" {...register(name)} />`). */
export function FormDatePicker<T extends FieldValues>({ control, name, ...props }: FormPickerProps<T, DatePickerProps>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => <DatePicker {...props} ref={field.ref} name={field.name} value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} />}
    />
  );
}
