import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const evidence = process.env.WYBP_COWRIE_EVIDENCE || join(tmpdir(), "wybp-cowrie-wallet-evidence");
const reference = `cw_${"a".repeat(32)}`;
const recovery = "b".repeat(64);
async function fixture(page: Page, freeQuickPlaysRemaining = 2, includeRecovery = true) {
  await page.route("**/cowries/projection", route => route.fulfill({ status: includeRecovery ? 404 : 200, contentType: "application/json", body: JSON.stringify(includeRecovery ? { available: false } : { available: true, wallet: { walletReference: reference, state: "active", totalBalance: 5, purchasedBalance: 3, bonusBalance: 2, freeQuickPlaysRemaining, bonusExpiresAfterDays: 180 } }) }));
  await page.route("**/cowries/wallet", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true, wallet: { walletReference: reference, state: "active", totalBalance: 5, purchasedBalance: 3, bonusBalance: 2, freeQuickPlaysRemaining, bonusExpiresAfterDays: 180 }, ...(includeRecovery ? { recoveryCredential: recovery } : {}) }) }));
}
test.beforeAll(async () => mkdir(evidence, { recursive: true }));

test("review wallet shows access, balance, recovery, expiry and accessibility states", async ({ page }) => {
  await fixture(page);
  await page.goto("/"); await page.getByRole("button", { name: /Cowries/i }).click();
  await page.getByRole("button", { name: "Create wallet" }).click();
  await expect(page.getByRole("heading", { name: "Cowrie Wallet" })).toBeVisible();
  await expect(page.getByText("2 of 2")).toBeVisible(); await expect(page.getByText(/costs 1 Cowrie/i)).toBeVisible();
  await expect(page.getByText(/Daily Challenges and incoming challenges stay free/i)).toBeVisible();
  await expect(page.getByText(/Bonus Cowries expire 180 days/i)).toBeVisible();
  await expect(page.getByText(/Purchased Cowries do not expire/i)).toBeVisible();
  await expect(page.getByText(/no cash value/i)).toBeVisible();
  await expect(page.locator('code[aria-label="Recovery credential"]')).toHaveText(recovery);
  await page.screenshot({ path: join(evidence, "two-free-plays-wallet.png"), fullPage: true });
  await page.getByText("Recover or rotate a wallet").click();
  await expect(page.getByRole("button", { name: "Recover wallet" })).toBeVisible();
  await page.screenshot({ path: join(evidence, "recovery-screen.png"), fullPage: true });
  await page.setViewportSize({ width: 320, height: 720 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: join(evidence, "layout-320.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 }); await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); await page.screenshot({ path: join(evidence, "zoom-200.png"), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.zoom = "1"; }); await page.keyboard.press("Tab"); await expect(page.locator(":focus")).toBeVisible(); await page.screenshot({ path: join(evidence, "keyboard-focus.png"), fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.screenshot({ path: join(evidence, "reduced-motion.png"), fullPage: true });
});

test("review evidence includes one-free and third-play requirement states", async ({ browser }) => {
  for (const remaining of [1, 0]) {
    const page = await browser.newPage(); await fixture(page, remaining, false); await page.goto("/"); await page.getByRole("button", { name: /Cowries 5/i }).click();
    await expect(page.getByText(`${remaining} of 2`)).toBeVisible(); await page.screenshot({ path: join(evidence, remaining === 1 ? "one-free-play.png" : "third-play-cowrie-required.png"), fullPage: true }); await page.close();
  }
});

test("a fresh device can recover before creating a wallet and then rotate without issuing a new allowance", async ({ page }) => {
  let creations = 0;
  await page.route("**/cowries/projection", route => route.fulfill({ status: 404, contentType: "application/json", body: '{"available":false}' }));
  await page.route("**/cowries/wallet", route => { creations += 1; return route.fulfill({ status: 400, contentType: "application/json", body: '{"available":false}' }); });
  const wallet = { walletReference: reference, state: "active", totalBalance: 5, purchasedBalance: 3, bonusBalance: 2, freeQuickPlaysRemaining: 0, bonusExpiresAfterDays: 180 };
  await page.route("**/cowries/recover", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true, wallet }) }));
  await page.route("**/cowries/rotate", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true, wallet, recoveryCredential: "c".repeat(64) }) }));
  await page.goto("/"); await page.getByRole("button", { name: /Cowries/i }).click();
  await page.getByText("Recover or rotate a wallet").click();
  await page.getByLabel("Wallet reference", { exact: true }).fill(reference); await page.getByLabel("Recovery credential", { exact: true }).fill(recovery);
  await page.getByRole("button", { name: "Recover wallet", exact: true }).click();
  await expect(page.getByText("0 of 2")).toBeVisible(); await expect(page.getByRole("status").filter({ hasText: "Wallet recovered" })).toBeVisible();
  await page.getByRole("button", { name: "Rotate credential" }).click();
  await expect(page.locator('code[aria-label="Recovery credential"]')).toHaveText("c".repeat(64));
  expect(creations).toBe(0); expect(page.url()).not.toContain(recovery);
});
