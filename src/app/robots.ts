import type { MetadataRoute } from "next";

const base = process.env.APP_URL ?? "http://localhost:3000";

/** Only the public marketing pages are crawlable; everything behind sign-in is off-limits. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/login", "/register"],
        disallow: ["/api/", "/admin", "/dashboard", "/students", "/teachers", "/staff", "/attendance", "/finance", "/exams", "/reports", "/settings", "/my", "/support", "/documents", "/help", "/onboarding", "/communication", "/notifications", "/academics", "/profile"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
