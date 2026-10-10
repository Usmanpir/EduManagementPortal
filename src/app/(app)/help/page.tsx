import type { Metadata } from "next";
import { can, isPortalUser, requirePageContext } from "@/server/auth/context";
import { HELP_ARTICLES, HELP_CATEGORIES } from "@/lib/help";
import { HelpIndex } from "./help-index";

export const metadata: Metadata = { title: "Help" };

export default async function HelpPage() {
  const ctx = await requirePageContext();
  const family = isPortalUser(ctx);
  const articles = HELP_ARTICLES.filter((a) => a.audience.includes(family ? "family" : "staff") || (!family && a.audience.includes("family")));
  return (
    <HelpIndex
      articles={articles.map(({ slug, title, summary, category, body }) => ({ slug, title, summary, category, text: body.join(" ") }))}
      categories={HELP_CATEGORIES.filter((c) => articles.some((a) => a.category === c))}
      canContact={can(ctx, "support.use")}
      canSetup={can(ctx, "settings.manage")}
    />
  );
}
