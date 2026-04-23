import { expect, test } from "@playwright/test";

test("landing page renders and links to login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Cold outreach/i);
  await page.getByRole("link", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel(/email/i)).toBeVisible();
});

test("login form rejects invalid email client-side", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("not-an-email");
  await page.getByRole("button", { name: /send magic link/i }).click();
  // Browser native validation prevents submission.
  await expect(page).toHaveURL(/\/login$/);
});
