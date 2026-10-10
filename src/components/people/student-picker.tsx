"use client";

import { useEffect, useState } from "react";
import { Combobox } from "@/components/common/combobox";
import { api } from "@/lib/api-client";

type Option = { value: string; label: string; hint?: string };

/** Searches students on the server as you type (works for any school size). */
export function StudentPicker({ id = "studentId", value, onChange, invalid }: { id?: string; value: string | null | undefined; onChange: (id: string) => void; invalid?: boolean }) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => {
      api
        .get<{ rows: { id: string; name: string; admissionNo: string; className: string | null; sectionName: string | null }[] }>(
          `/api/students?pageSize=25${query ? `&q=${encodeURIComponent(query)}` : ""}`,
          { signal: controller.signal },
        )
        .then(({ data }) => setOptions(data.rows.map((s) => ({ value: s.id, label: s.name, hint: s.className ? `${s.className}-${s.sectionName ?? ""}` : s.admissionNo }))))
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  return (
    <Combobox
      id={id}
      value={value}
      invalid={invalid}
      onChange={(v) => {
        setLabel(options.find((o) => o.value === v)?.label ?? null);
        onChange(v);
      }}
      options={options}
      selectedLabel={label}
      onQueryChange={setQuery}
      placeholder="Choose a student"
      searchPlaceholder="Search by name or admission no."
      emptyText="No students found."
    />
  );
}
