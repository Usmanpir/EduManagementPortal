"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, ListFilter, Search, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useUrlState } from "./use-url-state";

export type FilterOption = { value: string; label: string; hint?: string };
export type FilterDef = { key: string; label: string; options: FilterOption[]; multiple?: boolean };

function FilterMenu({ def, selected, onChange }: { def: FilterDef; selected: string[]; onChange: (values: string[]) => void }) {
  const [query, setQuery] = useState("");
  const options = query ? def.options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : def.options;
  const toggle = (value: string) => {
    if (def.multiple) onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
    else onChange(selected.includes(value) ? [] : [value]);
  };

  return (
    <div className="flex flex-col">
      {def.options.length > 8 && (
        <div className="border-b p-1.5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${def.label.toLowerCase()}…`}
            className="h-8 border-0 shadow-none focus-visible:ring-0"
            aria-label={`Search ${def.label}`}
          />
        </div>
      )}
      <ul role="listbox" aria-multiselectable={def.multiple} aria-label={def.label} className="max-h-72 overflow-y-auto p-1">
        {options.length === 0 && <li className="px-2 py-6 text-center text-small text-muted-foreground">No matches</li>}
        {options.map((o) => {
          const active = selected.includes(o.value);
          return (
            <li key={o.value} role="option" aria-selected={active}>
              <button
                type="button"
                onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-start text-small outline-none hover:bg-muted focus-visible:bg-muted"
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center border transition-colors",
                    def.multiple ? "rounded-xs" : "rounded-full",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
                  )}
                >
                  {active && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && <span className="text-caption text-muted-foreground">{o.hint}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Search + filters for list pages. State lives in the URL; on phones the
 * filters move into a bottom sheet.
 */
export function FilterBar({
  filters = [],
  searchPlaceholder = "Search…",
  searchKey = "q",
  actions,
  className,
}: {
  filters?: FilterDef[];
  searchPlaceholder?: string;
  searchKey?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  const { get, getAll, set } = useUrlState();
  const urlQuery = get(searchKey) ?? "";
  const [search, setSearch] = useState(urlQuery);
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Follow external URL changes (e.g. "Clear all") without fighting the user's typing.
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setSearch(urlQuery);
  }

  useEffect(() => {
    if (search === urlQuery) return;
    const t = setTimeout(() => set({ [searchKey]: search.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  const active = filters.flatMap((def) =>
    getAll(def.key).map((value) => ({
      def,
      value,
      label: def.options.find((o) => o.value === value)?.label ?? value,
    })),
  );
  const activeCount = active.length;

  const removeValue = (def: FilterDef, value: string) => set({ [def.key]: getAll(def.key).filter((v) => v !== value) });
  const clearAll = () => set({ ...Object.fromEntries(filters.map((f) => [f.key, null])), [searchKey]: null });

  return (
    <div className={cn("mb-4 flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="ps-9 text-ellipsis"
          />
        </div>

        {/* Desktop: one popover per filter */}
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {filters.map((def) => {
            const selected = getAll(def.key);
            const summary =
              selected.length === 0 ? null : selected.length === 1 ? (def.options.find((o) => o.value === selected[0])?.label ?? selected[0]) : `${selected.length} selected`;
            return (
              <Popover key={def.key}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("gap-1.5 font-normal", selected.length && "border-primary/40 bg-primary-subtle/60")}>
                    <span className={cn(selected.length ? "text-muted-foreground" : "text-foreground")}>{def.label}</span>
                    {summary && <span className="max-w-32 truncate font-medium text-foreground">{summary}</span>}
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-60 p-0">
                  <FilterMenu def={def} selected={selected} onChange={(values) => set({ [def.key]: values })} />
                </PopoverContent>
              </Popover>
            );
          })}
        </div>

        {/* Mobile: a single button opening a bottom sheet */}
        {filters.length > 0 && (
          <Button variant="outline" className="md:hidden" onClick={() => setSheetOpen(true)}>
            <ListFilter /> Filters
            {activeCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-primary text-[0.6875rem] text-primary-foreground">{activeCount}</span>}
          </Button>
        )}

        {actions && <div className="ms-auto flex items-center gap-2">{actions}</div>}
      </div>

      {(activeCount > 0 || urlQuery) && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {urlQuery && (
            <Chip label={`Search: “${urlQuery}”`} onRemove={() => set({ [searchKey]: null })} />
          )}
          {active.map((a) => (
            <Chip key={`${a.def.key}-${a.value}`} label={`${a.def.label}: ${a.label}`} onRemove={() => removeValue(a.def, a.value)} />
          ))}
          <Button variant="link" size="xs" onClick={clearAll} className="h-6 text-small">
            Clear all
          </Button>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-2xl p-0">
          <SheetHeader className="border-b">
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription className="sr-only">Narrow down the list</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            {filters.map((def) => (
              <section key={def.key} className="border-b px-2 py-3 last:border-0">
                <h3 className="px-2 pb-1 text-small font-semibold">{def.label}</h3>
                <FilterMenu def={def} selected={getAll(def.key)} onChange={(values) => set({ [def.key]: values })} />
              </section>
            ))}
          </div>
          <SheetFooter className="flex-row border-t">
            <Button variant="outline" className="flex-1" onClick={clearAll}>
              Clear all
            </Button>
            <Button className="flex-1" onClick={() => setSheetOpen(false)}>
              Show results
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-md border bg-card ps-2.5 pe-1 text-small shadow-xs">
      <span className="max-w-60 truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="grid size-5 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}
