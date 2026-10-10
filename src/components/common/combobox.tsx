"use client";

import { useId, useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ComboOption = { value: string; label: string; hint?: string; keywords?: string };

/** Searchable single-select for long option lists (timezones, students, subjects…). */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  disabled,
  invalid,
  className,
  onQueryChange,
  selectedLabel,
  ariaLabel,
}: {
  /** Accessible name when there's no visible <label> pointing at `id`. */
  ariaLabel?: string;
  /** Server-side search: called as the user types; options are shown unfiltered. */
  onQueryChange?: (query: string) => void;
  /** Label for the current value when it isn't in the (async) options list. */
  selectedLabel?: string | null;
  id?: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const remote = !!onQueryChange;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={invalid || undefined}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-start text-sm shadow-xs transition-[border-color,box-shadow] outline-none hover:border-border-strong focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50 aria-invalid:border-danger dark:bg-input/20",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "text-subtle-foreground")}>{selected?.label ?? selectedLabel ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <CommandPrimitive
          shouldFilter={!remote}
          filter={(itemValue, search, keywords) => {
            const hay = `${itemValue} ${keywords?.join(" ") ?? ""}`.toLowerCase();
            return search
              .toLowerCase()
              .split(/\s+/)
              .every((part) => hay.includes(part))
              ? 1
              : 0;
          }}
        >
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" />
            <CommandPrimitive.Input onValueChange={onQueryChange} placeholder={searchPlaceholder} className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground" />
          </div>
          <CommandPrimitive.List id={listId} className="max-h-64 overflow-y-auto p-1">
            <CommandPrimitive.Empty className="py-6 text-center text-small text-muted-foreground">{emptyText}</CommandPrimitive.Empty>
            {options.map((o) => (
              <CommandPrimitive.Item
                key={o.value}
                value={`${o.label} ${o.value}`}
                keywords={o.keywords ? [o.keywords] : undefined}
                onSelect={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-small outline-none select-none data-[selected=true]:bg-muted"
              >
                <Check className={cn("size-4 shrink-0 text-primary", o.value === value ? "opacity-100" : "opacity-0")} />
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && <span className="text-caption text-muted-foreground">{o.hint}</span>}
              </CommandPrimitive.Item>
            ))}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}
