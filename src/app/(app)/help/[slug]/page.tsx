import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { can, isPortalUser, requirePageContext } from "@/server/auth/context";
import { helpArticle } from "@/lib/help";

export async function generateMetadata({ params }: PageProps<"/help/[slug]">): Promise<Metadata> {
  const a = helpArticle((await params).slug);
  return { title: a ? `${a.title} · Help` : "Help" };
}

/** Renders "1. step" lines as an ordered list and the rest as paragraphs. */
function Body({ lines }: { lines: string[] }) {
  const blocks: (string | string[])[] = [];
  for (const line of lines) {
    const step = /^\d+\.\s/.test(line);
    const last = blocks[blocks.length - 1];
    if (step && Array.isArray(last)) last.push(line.replace(/^\d+\.\s/, ""));
    else blocks.push(step ? [line.replace(/^\d+\.\s/, "")] : line);
  }
  return (
    <div className="flex flex-col gap-4 text-body leading-relaxed">
      {blocks.map((b, i) =>
        Array.isArray(b) ? (
          <ol key={i} className="flex list-decimal flex-col gap-2 ps-6 marker:font-semibold marker:text-primary">
            {b.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        ) : (
          <p key={i}>{b}</p>
        ),
      )}
    </div>
  );
}

export default async function HelpArticlePage({ params }: PageProps<"/help/[slug]">) {
  const ctx = await requirePageContext();
  const { slug } = await params;
  const a = helpArticle(slug);
  const family = isPortalUser(ctx);
  if (!a || (family && !a.audience.includes("family"))) notFound();
  const related = (a.related ?? []).map(helpArticle).filter((r) => r && (!family || r.audience.includes("family")));

  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-5">
      <BreadcrumbLabel segment={slug} label={a.title} />
      <Button variant="ghost" size="sm" asChild className="-ms-2 self-start">
        <Link href="/help">
          <ArrowLeft className="rtl:rotate-180" /> All help
        </Link>
      </Button>
      <PageHeader eyebrow={<span className="text-caption font-medium text-muted-foreground">{a.category}</span>} title={a.title} description={a.summary} />
      <div className="rounded-xl border bg-card p-6 shadow-xs">
        <Body lines={a.body} />
      </div>
      {related.length > 0 && (
        <section>
          <h2 className="mb-2 text-h3">Related</h2>
          <ul className="flex flex-col gap-1">
            {related.map((r) => (
              <li key={r!.slug}>
                <Link href={`/help/${r!.slug}`} className="text-small font-medium text-primary hover:underline">
                  {r!.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {can(ctx, "support.use") && (
        <p className="text-small text-muted-foreground">
          Didn&apos;t answer your question?{" "}
          <Link href="/support?new=1" className="font-medium text-primary hover:underline">
            Contact support
          </Link>
        </p>
      )}
    </article>
  );
}
