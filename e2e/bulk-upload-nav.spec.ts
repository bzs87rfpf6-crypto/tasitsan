import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test.skip(!EMAIL || !PASSWORD, "Set E2E_EMAIL and E2E_PASSWORD to run.");

async function login(page: Page) {
  await page.goto("/auth");
  await page.getByLabel(/e-?posta|email/i).first().fill(EMAIL!);
  await page.getByLabel(/şifre|password/i).first().fill(PASSWORD!);
  await page.getByRole("button", { name: /giriş|sign in|login/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
}

test.describe("Toplu Parça Yükle navigation", () => {
  test("click on /sell navigates to /sell/bulk and trace fires", async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[bulk-nav]")) consoleLogs.push(text);
    });

    await login(page);
    await page.goto("/sell");

    // Button exists and points to /sell/bulk
    const button = page.getByRole("link", { name: /toplu parça yükle/i });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("href", "/sell/bulk");

    // Click and assert navigation completes
    await Promise.all([
      page.waitForURL("**/sell/bulk", { timeout: 15_000 }),
      button.click(),
    ]);

    expect(page.url()).toMatch(/\/sell\/bulk$/);

    // Page rendered (header subtitle visible)
    await expect(page.getByText(/toplu parça yükle/i).first()).toBeVisible();

    // Trace events recorded by src/lib/bulkNavTrace.ts
    expect(consoleLogs.some((l) => l.includes("click"))).toBe(true);
    expect(consoleLogs.some((l) => l.includes("arrival"))).toBe(true);

    // SessionStorage trace contains both events
    const trace = await page.evaluate(() => sessionStorage.getItem("bulk_nav_trace_v1"));
    expect(trace).toBeTruthy();
    const events = JSON.parse(trace!) as Array<{ type: string }>;
    expect(events.some((e) => e.type === "click")).toBe(true);
    expect(events.some((e) => e.type === "arrival")).toBe(true);
  });

  test("?trace=1 shows the diagnostic badge", async ({ page }) => {
    await login(page);
    await page.goto("/sell");
    await page.getByRole("link", { name: /toplu parça yükle/i }).click();
    await page.waitForURL("**/sell/bulk");

    // Re-visit with trace flag (preserves session storage from the click above)
    await page.goto("/sell/bulk?trace=1");
    const badge = page.getByTestId("bulk-nav-trace");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/açıldı|doğrudan/i);
  });
});
