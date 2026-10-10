/**
 * Crawls the whole UI as each role and reports anything broken.
 *
 *   node scripts/ui-crawl.mjs [roles…]        e.g.  node scripts/ui-crawl.mjs admin parent
 *   BASE_URL=http://localhost:3000 MAX_PAGES=150 node scripts/ui-crawl.mjs
 *
 * For every reachable page (following links breadth-first, at most 2 pages per
 * route pattern) it records: HTTP status, crashes, console errors, failed
 * requests, hydration warnings, "not found" pages reached from a link,
 * loaders that never finish, scroll areas nested inside the page, native
 * date/time/select controls,
 * horizontal scrolling on a phone, and load time. Writes ui-crawl-report.json
 * and exits 1 if anything is broken.
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const MAX = Number(process.env.MAX_PAGES ?? 150);
const ROLES = process.argv.slice(2).length ? process.argv.slice(2) : ["anon", "admin", "principal", "teacher", "accountant", "parent", "student", "superadmin"];
const SLOW_MS = Number(process.env.SLOW_MS ?? 2500);

const pattern = (path) => path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id").replace(/\?.*$/, "");
const IGNORE_CONSOLE = [/Download the React DevTools/i, /\[Fast Refresh\]/i, /\[HMR\]/i];
// Links we deliberately don't follow while crawling (they change state or download files).
const SKIP = [/^\/api\//, /\/print(\/|\?|$)/,/^\/logout/, /format=(csv|xlsx)/];

async function login(page, role) {
  if (role === "anon") return true;
  const email = role === "superadmin" ? "superadmin@eduattend.local" : `${role}@demo.eduattend.local`;
  const res = await page.request.post(`${base}/api/auth/login`, { data: { email, password: role === "superadmin" ? "SuperAdmin#2026" : "EduAttend#2026" }, headers: { origin: base } });
  return res.ok();
}

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
const report = [];
let broken = 0;

for (const role of ROLES) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  if (!(await login(page, role))) {
    console.log(`✗ ${role}: login failed`);
    broken++;
    continue;
  }
  const start = role === "anon" ? ["/", "/pricing", "/login", "/register", "/forgot-password"] : role === "superadmin" ? ["/admin"] : ["/dashboard"];
  const queue = [...start];
  const seen = new Set();
  const perPattern = new Map();
  const findings = [];

  let current = { console: [], failed: [], hydration: false };
  page.on("console", (m) => {
    if (m.type() !== "error" && !/hydrat/i.test(m.text())) return;
    if (IGNORE_CONSOLE.some((r) => r.test(m.text()))) return;
    if (/hydrat/i.test(m.text())) current.hydration = true;
    current.console.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => current.console.push(`PAGE ERROR: ${e.message.slice(0, 300)}`));
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.origin !== new URL(base).origin) return;
    // Prefetches of routes are fine to 404 only if the link itself is broken — reported via the page visit.
    if (r.status() >= 400 && !u.searchParams.has("_rsc")) current.failed.push(`${r.status()} ${u.pathname}${u.search}`);
  });

  while (queue.length && seen.size < MAX) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    const pat = pattern(path);
    if ((perPattern.get(pat) ?? 0) >= 2) continue;
    seen.add(path);
    perPattern.set(pat, (perPattern.get(pat) ?? 0) + 1);
    current = { console: [], failed: [], hydration: false };

    const t0 = Date.now();
    let status = 0;
    try {
      const res = await page.goto(base + path, { waitUntil: "load", timeout: 30000 });
      status = res?.status() ?? 0;
      await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
    } catch (e) {
      current.console.push(`NAVIGATION: ${e.message.slice(0, 200)}`);
    }
    const ms = Date.now() - t0;
    const info = await page
      .evaluate(() => ({
        title: document.title,
        notFound: !!document.querySelector("[data-not-found]") || /page not found|couldn.t find that page/i.test(document.body.innerText.slice(0, 600)),
        crashed: /something went wrong/i.test(document.body.innerText.slice(0, 800)),
        // Loaders still showing after the network went quiet = something never finished loading.
        stuckLoading: [...document.querySelectorAll('main [aria-busy="true"], main [data-slot="skeleton"]')].filter((el) => el.getBoundingClientRect().height > 0).length,
        // Browser-native pickers look different in every browser; the app has its own.
        nativePickers: document.querySelectorAll('input[type="date"], input[type="time"], input[type="month"], input[type="week"], input[type="datetime-local"], select:not([aria-hidden="true"])').length,
        // A scrolling box inside the scrolling page gives two scrollbars; only deliberate ones are allowed.
        nestedScroll: [...document.querySelectorAll("main *")]
          .filter((el) => {
            const cs = getComputedStyle(el);
            return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 160 && !el.closest("[data-scroll-area]");
          })
          .map((el) => `<${el.tagName.toLowerCase()} class="${(el.className?.toString?.() ?? "").slice(0, 60)}">`)
          .slice(0, 2),
        links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => h && h.startsWith("/") && !h.startsWith("//")),
        finalPath: location.pathname + location.search,
      }))
      .catch(() => ({ title: "", notFound: false, crashed: false, stuckLoading: 0, nativePickers: 0, nestedScroll: [], links: [], finalPath: path }));

    for (const href of info.links) {
      const clean = href.split("#")[0];
      if (!clean || SKIP.some((r) => r.test(clean)) || seen.has(clean)) continue;
      queue.push(clean);
    }

    const problems = [];
    if (status >= 400 && !(info.notFound && status === 404 && path !== info.finalPath)) problems.push(`HTTP ${status}`);
    if (info.notFound) problems.push("not-found page");
    if (info.crashed) problems.push("error boundary");
    if (current.hydration) problems.push("hydration mismatch");
    if (info.stuckLoading) problems.push(`still loading after the network went idle (${info.stuckLoading} placeholders)`);
    if (info.nativePickers) problems.push(`${info.nativePickers} native date/time/select control(s)`);
    if (info.nestedScroll.length) problems.push(`nested scroll area ${info.nestedScroll.join(", ")}`);
    if (current.console.length) problems.push(...current.console.map((c) => `console: ${c}`));
    if (current.failed.length) problems.push(...[...new Set(current.failed)].map((f) => `request: ${f}`));
    const slow = ms > SLOW_MS;
    findings.push({ path, finalPath: info.finalPath, status, ms, title: info.title, problems, slow });
    if (problems.length) broken++;
    process.stdout.write(problems.length ? "✗" : slow ? "s" : ".");
  }

  // Phone pass: horizontal scrolling on every page found.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const f of findings) {
    if (f.problems.length) continue;
    try {
      await page.goto(base + f.path, { waitUntil: "load", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
      const overflow = await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth <= w + 1) return null;
        // Name the widest offender to make fixing easy.
        let worst = null;
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.right > w + 1 && r.width > 0 && !el.closest("[data-scroll-x], .overflow-x-auto, .overflow-auto, table")) {
            if (!worst || r.right > worst.right) worst = { right: Math.round(r.right), tag: el.tagName.toLowerCase(), cls: (el.className?.toString?.() ?? "").slice(0, 80), text: (el.textContent ?? "").trim().slice(0, 40) };
          }
        }
        return { scrollWidth: document.documentElement.scrollWidth, worst };
      });
      if (overflow) {
        f.problems.push(`mobile overflow ${overflow.scrollWidth}px${overflow.worst ? ` (<${overflow.worst.tag} class="${overflow.worst.cls}"> "${overflow.worst.text}")` : ""}`);
        broken++;
      }
    } catch {
      /* already reported in the desktop pass */
    }
  }

  const bad = findings.filter((f) => f.problems.length);
  const slow = findings.filter((f) => f.slow);
  console.log(`\n${role}: ${findings.length} pages, ${bad.length} with problems, ${slow.length} slow (>${SLOW_MS}ms)`);
  for (const f of bad) console.log(`  ✗ ${f.path}${f.finalPath !== f.path ? ` → ${f.finalPath}` : ""}\n      ${f.problems.join("\n      ")}`);
  for (const f of slow) console.log(`  ⏱ ${f.path} ${f.ms}ms`);
  report.push({ role, pages: findings });
  await context.close();
}

await browser.close();
writeFileSync("ui-crawl-report.json", JSON.stringify(report, null, 2));
console.log(`\n${broken ? `✗ ${broken} problems` : "✓ No problems found"} — details in ui-crawl-report.json`);
process.exitCode = broken ? 1 : 0;
