/**
 * Captures screenshots of key screens for visual QA.
 *
 *   node scripts/screenshots.mjs <outDir> <role|anon> <width> <theme> <path> [<path> ...]
 *   e.g. node scripts/screenshots.mjs ./shots admin 1440 light /dashboard /students
 *
 * Uses the locally installed Chrome so no browser download is needed.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const [outDir = "./shots", role = "anon", widthArg = "1440", theme = "light", ...paths] = process.argv.slice(2);
const width = Number(widthArg);
const height = width < 500 ? 844 : width < 1100 ? 1024 : 900;
const base = process.env.BASE_URL ?? "http://localhost:3000";
const password = process.env.DEMO_PASSWORD ?? "EduAttend#2026";

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
const context = await browser.newContext({
  viewport: { width, height },
  colorScheme: theme === "dark" ? "dark" : "light",
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

if (role !== "anon") {
  const email = role.includes("@") ? role : role === "superadmin" ? "superadmin@eduattend.local" : `${role}@demo.eduattend.local`;
  const res = await page.request.post(`${base}/api/auth/login`, {
    data: { email, password: role === "superadmin" ? "SuperAdmin#2026" : password, remember: true },
    headers: { origin: base },
  });
  if (!res.ok()) {
    console.error("Login failed", res.status(), await res.text());
    process.exit(1);
  }
}

for (const p of paths.length ? paths : ["/"]) {
  const url = `${base}${p}`;
  // Wait for the network to settle, but don't fail on a stray long-lived request (e.g. a prefetch).
  await page.goto(url, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  const name = `${role}-${width}-${theme}${p.replace(/[/?=&]+/g, "_") || "_root"}.png`;
  await page.screenshot({ path: path.join(outDir, name), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log(`${name}${overflow ? "  ⚠ horizontal overflow" : ""}`);
}

if (errors.length) console.log("\nBrowser errors:\n" + [...new Set(errors)].join("\n"));
await browser.close();
