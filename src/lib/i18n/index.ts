import { ar } from "./ar";
import { en, type Dictionary, type TranslationKey } from "./en";
import { ur } from "./ur";

export const LOCALES = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "ur", name: "اردو", dir: "rtl" },
  { code: "ar", name: "العربية", dir: "rtl" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "ea_locale";

const DICTIONARIES: Record<Locale, Partial<Dictionary>> = { en, ur, ar };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.some((l) => l.code === value);
}

export function directionOf(locale: Locale): "ltr" | "rtl" {
  return LOCALES.find((l) => l.code === locale)?.dir ?? "ltr";
}

export type Translator = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export function createTranslator(locale: Locale): Translator {
  const dict = DICTIONARIES[locale] ?? en;
  return (key, vars) => {
    let text = dict[key] ?? en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
    return text;
  };
}

export type { TranslationKey };
