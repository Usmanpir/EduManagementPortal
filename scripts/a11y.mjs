/**
 * Accessibility audit with axe-core across key screens, per role and theme.
 *
 *   node scripts/a11y.mjs <role|anon> <light|dark> <path> [<path> ...]
 *
 * Prints serious/critical violations (and a count of minor ones). Exit code 1 if any serious issue.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const [role = "anon", theme = "light", ...paths] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3000";

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme === "dark" ? "dark" : "light" });
const page = await context.newPage();
if (role !== "anon") {
  const email = role === "superadmin" ? "superadmin@eduattend.local" : `${role}@demo.eduattend.local`;
  const res = await page.request.post(`${base}/api/auth/login`, { data: { email, password: role === "superadmin" ? "SuperAdmin#2026" : "EduAttend#2026" }, headers: { origin: base } });
  if (!res.ok()) throw new Error(`Login failed for ${email}`);
}

let serious = 0;
for (const p of paths) {
  await page.goto(`${base}${p}`, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    // @ts-expect-error injected
    const r = await window.axe.run(document, { resultTypes: ["violations"], runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ") + (n.failureSummary ? ` — ${n.failureSummary.split("\n").slice(1, 2).join("")}` : "")), count: v.nodes.length }));
  });
  const bad = result.filter((v) => v.impact === "serious" || v.impact === "critical");
  serious += bad.length;
  console.log(`\n${p} [${role}/${theme}] — ${bad.length} serious, ${result.length - bad.length} minor`);
  for (const v of bad) {
    console.log(`  ✗ ${v.id} (${v.impact}, ${v.count}×): ${v.help}`);
    for (const n of v.nodes) console.log(`      ${n}`);
  }
}
await browser.close();
process.exitCode = serious ? 1 : 0;
