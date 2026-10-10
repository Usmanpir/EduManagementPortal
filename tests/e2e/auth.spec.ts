import { expect, test } from "@playwright/test";

const PASSWORD = "EduAttend#2026";

test.describe("authentication", () => {
  test("admin signs in, lands on the dashboard, and signs out", async ({ page, isMobile }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@demo.eduattend.local");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ahmed");

    // Signed-in users never see the marketing page.
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard$/);

    if (isMobile) {
      await page.getByRole("banner").getByRole("button", { name: "Profile" }).click();
    } else {
      await page.getByRole("complementary", { name: "Main navigation" }).getByRole("button", { name: "Profile" }).click();
    }
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("shows a clear error for wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@demo.eduattend.local");
    await page.getByLabel("Password", { exact: true }).fill("wrong-password-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "didn't work" })).toBeVisible();
  });

  test("redirects anonymous visitors from app pages to sign in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });
});
