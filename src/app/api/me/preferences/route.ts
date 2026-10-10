import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/server/db/client";
import { isProduction } from "@/server/env";
import { ok, route } from "@/server/http/api";
import { LOCALE_COOKIE, LOCALES } from "@/lib/i18n";

const body = z.object({
  locale: z.enum(LOCALES.map((l) => l.code) as [string, ...string[]]),
});

export const PUT = route({ body, allowInactiveSubscription: true }, async ({ ctx, body }) => {
  await db.user.update({ where: { id: ctx.user.id }, data: { locale: body.locale } });
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, body.locale, { path: "/", sameSite: "lax", secure: isProduction, maxAge: 60 * 60 * 24 * 365 });
  return ok({ locale: body.locale }, "Preferences saved.");
});
