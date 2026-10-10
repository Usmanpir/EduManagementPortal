"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none__";

/**
 * Select bound to a nullable id. `noneLabel` adds an explicit "none" choice
 * (Radix Select can't use an empty string as a value).
 */
export function OptionSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Select…",
  noneLabel,
  disabled,
  invalid,
  ariaLabel,
}: {
  id?: string;
  /** Accessible name when there's no visible <label> pointing at `id`. */
  ariaLabel?: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  options: { value: string; label: string; hint?: string }[];
  placeholder?: string;
  noneLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <Select value={value ?? (noneLabel ? NONE : "")} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger id={id} aria-invalid={invalid || undefined} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {noneLabel && (
          <SelectItem value={NONE}>
            <span className="text-muted-foreground">{noneLabel}</span>
          </SelectItem>
        )}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
            {o.hint && <span className="text-caption text-muted-foreground"> · {o.hint}</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
