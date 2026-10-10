"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "cn";
import { PersonAvatar } from "@/components/common/person-avatar";

/** Remembers the selected child so the next /my page opens on them. */
function rememberChild(id: string) {
  document.cookie = `ea_child=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

type Child = { id: string; name: string; className: string | null };

/** Lets a parent with several children switch between them; remembered for next time. */
export function ChildSwitcher({ students, selectedId }: { students: Child[]; selectedId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (students.length < 2) return null;

  const pick = (id: string) => {
    rememberChild(id);
    const q = new URLSearchParams(searchParams);
    q.set("student", id);
    q.delete("exam");
    router.push(`${pathname}?${q}`);
  };

  return (
    <div role="radiogroup" aria-label="Child" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {students.map((s) => {
        const active = s.id === selectedId;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => pick(s.id)}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-full border py-1.5 ps-1.5 pe-4 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "border-primary bg-primary-subtle/60" : "bg-card hover:bg-muted/50",
            )}
          >
            <PersonAvatar name={s.name} size="sm" />
            <span>
              <span className="block text-small leading-tight font-medium">{s.name.split(" ")[0]}</span>
              <span className="block text-caption leading-tight text-muted-foreground">{s.className ?? "—"}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
