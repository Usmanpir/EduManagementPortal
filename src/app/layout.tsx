import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Arabic } from "next/font/google";
import { headers } from "next/headers";
import { AppProviders } from "@/components/providers/app-providers";
import { getI18n } from "@/lib/i18n/server";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });
// Urdu & Arabic glyphs; only downloaded when those characters render.
const arabic = Noto_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"], display: "swap", preload: false });

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "EduAttend — Run your entire school from one simple platform",
    template: "%s · EduAttend",
  },
  description:
    "Attendance, students, teachers, fees, exams, communication and analytics — all in one modern platform for schools and colleges.",
  applicationName: "EduAttend",
  openGraph: { type: "website", siteName: "EduAttend", locale: "en_PK" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#121318" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [{ locale, dir }, h] = await Promise.all([getI18n(), headers()]);
  const nonce = h.get("x-nonce") ?? undefined;

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${arabic.variable} h-full`}
    >
      {/* Browser extensions (password managers, anti-trackers) inject attributes into <body>. */}
      <body className="min-h-full" suppressHydrationWarning>
        <AppProviders locale={locale} dir={dir} nonce={nonce}>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
