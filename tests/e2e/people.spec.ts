import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "EduAttend#2026";

async function signIn(page: Page, email = "admin@demo.eduattend.local") {
  const res = await page.request.post("/api/auth/login", { data: { email, password: PASSWORD, remember: true }, headers: { origin: "http://localhost:3000" } });
  expect(res.ok()).toBeTruthy();
}

test.describe("students", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop flows; mobile covered by screenshots");

  test("adds a student from the drawer and lands on their profile", async ({ page }) => {
    await signIn(page);
    const unique = `E2E${Date.now().toString(36)}`;
    await page.goto("/students?new=1");
    const drawer = page.getByRole("dialog", { name: "Add student" });
    await expect(drawer).toBeVisible();
    await drawer.getByLabel("First name").first().fill("Test");
    await drawer.getByLabel("Last name").first().fill(unique);
    await drawer.getByLabel("Phone").first().fill(`+92 300 ${String(Date.now()).slice(-7)}`);
    // Guardian name fields come after the student fields.
    await drawer.getByLabel("First name").nth(1).fill("Parent");
    await drawer.getByLabel("Last name").nth(1).fill(unique);
    await page.getByRole("button", { name: "Add student" }).last().click();

    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Test ${unique}`);
    await page.getByRole("link", { name: /^Parents/ }).click();
    await expect(page.getByRole("heading", { name: "Parents & guardians" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: `Parent ${unique}` }).filter({ hasText: "Primary contact" })).toBeVisible();
  });

  test("imports a CSV after fixing an invalid row inline", async ({ page }) => {
    await signIn(page);
    const unique = `Imp${Date.now().toString(36)}`;
    const csv = [
      "First Name,Last Name,Campus,Class,Section,Guardian Name,Guardian Phone",
      `Zara,${unique},Islamabad Campus,Grade 3,A,Kamal ${unique},+92 300 1112233`,
      `Omar,${unique},Islamabad Campus,Grade 33,A,Kamal ${unique},+92 300 1112233`,
    ].join("\n");
    await page.goto("/students/import");
    await page.locator('input[type="file"]').setInputFiles({ name: "students.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });

    await expect(page.getByText("1 need attention")).toBeVisible();
    const classCell = page.getByLabel("Row 3 Class");
    await expect(classCell).toHaveAttribute("aria-invalid", "true");
    await classCell.fill("Grade 3");
    await page.getByRole("button", { name: "Check again" }).click();
    await expect(page.getByText("Every row passed validation.")).toBeVisible();
    await page.getByRole("button", { name: "Import 2 students" }).click();
    await expect(page.getByRole("heading", { name: "Import complete" })).toBeVisible();
    await expect(page.getByText("2 imported")).toBeVisible();
  });
});
