"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, LifeBuoy, ListChecks, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";

type Article = { slug: string; title: string; summary: string; category: string; text: string };

export function HelpIndex({ articles, categories, canContact, canSetup }: { articles: Article[]; categories: string[]; canContact: boolean; canSetup: boolean }) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return articles;
    return articles.filter((a) => {
      const hay = `${a.title} ${a.summary} ${a.text}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [articles, q]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Help"
        description="Short guides to everything in EduAttend."
        actions={
          canSetup && (
            <Button variant="outline" asChild>
              <Link href="/onboarding">
                <ListChecks /> Setup guide
              </Link>
            </Button>
          )
        }
      />
      <div className="relative">
        <Search className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search help — e.g. “import students”, “late fee”, “report card”" className="h-11 ps-9" aria-label="Search help" />
      </div>
      {matches.length === 0 ? (
        <EmptyState icon={Search} title="No articles match" description={canContact ? "Try other words, or ask our team." : "Try other words."} actions={canContact && <Button asChild><Link href="/support?new=1">Contact support</Link></Button>} />
      ) : (
        categories
          .filter((c) => matches.some((a) => a.category === c))
          .map((c) => (
            <section key={c} aria-labelledby={`help-${c}`}>
              <h2 id={`help-${c}`} className="mb-2 text-h3">
                {c}
              </h2>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
                {matches
                  .filter((a) => a.category === c)
                  .map((a) => (
                    <li key={a.slug}>
                      <Link href={`/help/${a.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{a.title}</span>
                          <span className="block text-small text-muted-foreground">{a.summary}</span>
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))
      )}
      {canContact && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-xs">
          <span className="grid size-10 place-items-center rounded-lg bg-primary-subtle text-primary-subtle-foreground">
            <LifeBuoy className="size-5" aria-hidden />
          </span>
          <p className="min-w-0 flex-1 text-small">
            <span className="block font-medium">Still stuck?</span>
            <span className="text-muted-foreground">Our team replies in your Support inbox and notifies you.</span>
          </p>
          <Button variant="outline" asChild>
            <Link href="/support?new=1">Contact support</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
