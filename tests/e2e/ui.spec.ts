import { expect, test, type Page } from "@playwright/test";

/**
 * Everyday UI interactions: navigation, search, filters, sorting, forms,
 * language/RTL and the phone layout. Read-only except the language switch,
 * which is restored afterwards.
 */
const PASSWORD = "EduAttend#2026";
const ORIGIN = process.env.BASE_URL ?? "http://localhost:3000";

async function signIn(page: Page, role = "admin") {
  const res = await page.request.post("/api/auth/login", { data: { email: `${role}@demo.eduattend.local`, password: PASSWORD, remember: true }, headers: { origin: ORIGIN } });
  expect(res.ok()).toBeTruthy();
}

/** Fails the test on uncaught page errors (crashes in client components). */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return () => expect(errors, "uncaught page errors").toEqual([]);
}

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "desktop layout");

  test("command palette finds a student and opens their profile", async ({ page }) => {
    const noErrors = watchErrors(page);
    await signIn(page);
    await page.goto("/dashboard");
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Search EduAttend" });
    await expect(palette).toBeVisible();
    await palette.getByRole("combobox").fill("Abdullah Ali");
    const result = palette.getByRole("option", { name: /Abdullah Ali/ }).first();
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Abdullah Ali");
    noErrors();
  });

  test("student list search, sort and filters live in the URL", async ({ page }) => {
    const noErrors = watchErrors(page);
    await signIn(page);
    await page.goto("/students");
    const table = page.getByRole("table");
    await expect(table.getByRole("row")).not.toHaveCount(1);

    await page.getByRole("searchbox", { name: /Search name/ }).fill("Abdullah Ali");
    await expect(page).toHaveURL(/[?&]q=Abdullah/);
    await expect(table.getByRole("row").filter({ hasText: "Abdullah Ali" }).first()).toBeVisible();
    await expect(table.getByRole("row").filter({ hasText: "Khadija Baig" })).toHaveCount(0);

    await page.goto("/students");
    const header = table.getByRole("columnheader", { name: /Student/ });
    await header.getByRole("button").click();
    await expect(page).toHaveURL(/sort=name&dir=asc/);
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    await header.getByRole("button").click();
    await expect(header).toHaveAttribute("aria-sort", "descending");
    noErrors();
  });

  test("an empty form shows inline errors instead of submitting", async ({ page }) => {
    await signIn(page);
    await page.goto("/students?new=1");
    const drawer = page.getByRole("dialog", { name: "Add student" });
    await expect(drawer).toBeVisible();
    await page.getByRole("button", { name: "Add student" }).last().click();
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('[aria-invalid="true"]').first()).toBeVisible();
    await expect(page).toHaveURL(/\/students\?new=1$/);
    await drawer.getByRole("button", { name: "Cancel" }).click();
    await expect(drawer).toBeHidden();
  });

  test("the timetable lesson editor opens ready to use", async ({ page }) => {
    const noErrors = watchErrors(page);
    await signIn(page);
    await page.goto("/academics/timetable");
    if (!(await page.locator("table button").first().count())) {
      await page.getByRole("combobox", { name: "Class" }).click();
      await page.getByRole("option").first().click();
    }
    await page.locator("table button").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("combobox", { name: /Subject/ })).toBeVisible();
    await expect(dialog.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /Save lesson|Add lesson/ })).toBeEnabled();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    noErrors();
  });

  test("date, time and month pickers set values without native browser controls", async ({ page }) => {
    const noErrors = watchErrors(page);
    await signIn(page);
    await expect(page.locator('input[type="date"], input[type="time"], input[type="month"]')).toHaveCount(0);

    // Date: jump years with the dropdown, then pick a day.
    await page.goto("/students?new=1");
    const drawer = page.getByRole("dialog", { name: "Add student" });
    await drawer.getByRole("button", { name: /Date of birth/ }).click();
    await page.getByRole("combobox", { name: /year/i }).click();
    await page.getByRole("option", { name: "2015" }).click();
    await page.locator('[data-slot="calendar"] button[data-day]:not([disabled])').nth(10).click();
    await expect(drawer.getByRole("button", { name: /Date of birth/ })).toContainText("2015");

    // Time: hour + minute columns.
    await page.goto("/attendance/staff");
    const trigger = page.getByRole("button", { name: /Check-in time for/ }).first();
    const row = page.getByRole("listitem").filter({ has: trigger });
    await row.getByRole("button", { name: /Present/ }).or(row.getByRole("radio", { name: /Present/ })).first().click();
    await trigger.click();
    await page.getByRole("listbox", { name: "Hour" }).getByRole("option", { name: "9", exact: true }).click();
    await page.getByRole("listbox", { name: "Minute" }).getByRole("option", { name: "30", exact: true }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(trigger).toHaveAccessibleName(/9:30 AM/);

    // Month: year grid.
    await page.goto("/reports/attendance-register");
    await page.getByRole("button", { name: /^Month/ }).click();
    await page.getByRole("button", { name: "Previous year" }).click();
    await page.getByRole("button", { name: "Mar", exact: true }).click();
    await expect(page).toHaveURL(/month=\d{4}-03/);
    noErrors();
  });

  test("sidebar highlights the current page and remembers being collapsed", async ({ page }) => {
    await signIn(page, "teacher");
    await page.goto("/attendance");
    const nav = page.getByRole("complementary", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "Student attendance" })).toHaveAttribute("aria-current", "page");

    await nav.getByRole("link", { name: "Leave" }).click();
    await expect(page).toHaveURL(/\/attendance\/leave$/);
    await expect(nav.getByRole("link", { name: "Leave" })).toHaveAttribute("aria-current", "page");

    await nav.getByRole("button", { name: "Toggle sidebar" }).click();
    await page.reload();
    await expect(nav.getByRole("link", { name: "Student attendance" })).toHaveCount(0);
    // Expand again so the cookie doesn't leak into other tests.
    await nav.getByRole("button", { name: "Toggle sidebar" }).click();
    await expect(nav.getByRole("button", { name: /Attendance/ })).toBeVisible();
  });

  test("switching to Urdu flips the layout to right-to-left", async ({ page }) => {
    await signIn(page, "accountant");
    try {
      await page.goto("/dashboard");
      await page.getByRole("complementary", { name: "Main navigation" }).getByRole("button", { name: "Profile" }).click();
      await page.getByRole("menuitem", { name: /Language/ }).click();
      await page.getByRole("menuitemradio", { name: "اردو" }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("html")).toHaveAttribute("lang", "ur");
    } finally {
      await page.request.put("/api/me/preferences", { data: { locale: "en" }, headers: { origin: ORIGIN } });
    }
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });

  test("parents only see their own children", async ({ page }) => {
    const noErrors = watchErrors(page);
    await signIn(page, "parent");
    await page.goto("/dashboard");
    await expect(page.getByRole("article")).toHaveCount(2);
    // Staff areas aren't offered to families.
    await expect(page.getByRole("complementary", { name: "Main navigation" }).getByRole("link", { name: "Students", exact: true })).toHaveCount(0);
    noErrors();
  });
});

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone layout");

  test("bottom navigation and menu sheet move between sections", async ({ page }) => {
    const noErrors = watchErrors(page);
    await signIn(page);
    await page.goto("/dashboard");
    const tabs = page.getByRole("navigation", { name: "Primary" });
    await tabs.getByRole("link", { name: "Students" }).click();
    await expect(page).toHaveURL(/\/students$/);
    await expect(tabs.getByRole("link", { name: "Students" })).toHaveAttribute("aria-current", "page");

    await page.getByRole("button", { name: "Open menu" }).click();
    const sheet = page.getByRole("dialog", { name: "Navigation" });
    await sheet.getByRole("link", { name: "Documents" }).click();
    await expect(page).toHaveURL(/\/documents$/);
    await expect(sheet).toBeHidden();
    noErrors();
  });

  test("pages never scroll sideways", async ({ page }) => {
    await signIn(page);
    for (const path of ["/dashboard", "/students", "/finance", "/attendance", "/exams/results", "/reports"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1);
    }
  });
});
