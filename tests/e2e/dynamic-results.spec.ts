import { expect, test } from "@playwright/test";

const slugs = { west: "8".repeat(48), east: "9".repeat(48), north: "a".repeat(48), private: "b".repeat(48) };

test("three regional public results render distinctly without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  for (const [slug, label, score] of [[slugs.west, "West Africa", "12"], [slugs.east, "East Africa", "8"], [slugs.north, "North Africa", "4"]]) {
    await page.goto(`/result/${slug}`); const result=page.locator("[data-public-result]"); await expect(result).toBeVisible(); await expect(result.getByText(label, { exact: false }).first()).toBeVisible(); await expect(result.locator(".public-result-score strong")).toHaveText(score); await expect(result).toContainText("A playful culture score, never a measure of human worth.");
  }
  await context.close();
});

test("Share Centre requires explicit publication and can return the result to private", async ({ page }) => {
  await page.goto("/?safeguard_fixture=safeguard-high-result");
  await page.getByRole("button", { name: "Open Share Centre" }).click();
  const centre = page.locator("[data-share-centre]"); await expect(centre).toBeVisible(); await expect(centre.locator("[data-result-publication]")).toHaveAttribute("data-publication-visibility", "private");
  const before = await page.request.get(`/result/${slugs.private}`); expect(await before.text()).toContain("This result is no longer available.");
  await expect(centre.getByText("Your entered name and private uploaded photo are excluded.")).toBeVisible();
  await centre.getByRole("button", { name: "Make result public" }).click(); await expect(centre.locator("[data-result-publication]")).toHaveAttribute("data-publication-visibility", "public"); await expect(centre.locator(".share-centre-link-mode")).toContainText("Published public result");
  await centre.getByRole("button", { name: "Unpublish result" }).click(); await expect(centre.locator("[data-result-publication]")).toHaveAttribute("data-publication-visibility", "private"); await expect(centre.locator(".share-centre-link-mode")).not.toContainText("Published public result");
});
