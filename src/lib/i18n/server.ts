import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createTranslator, DEFAULT_LOCALE, directionOf, isLocale, LOCALE_COOKIE, type Locale } from "./index";

/** Locale precedence: explicit cookie choice → default. User/org preferences set the cookie on change. */
export const getLocale = cache(async (): Promise<Locale> => {
  const jar = await cookies();
  const fromCookie = jar.get(LOCALE_COOKIE)?.value;
  return isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
});

export async function getI18n() {
  const locale = await getLocale();
  return { locale, dir: directionOf(locale), t: createTranslator(locale) };
}
