import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const evidence = process.env.WYBP_RANDOM_QUICK_PLAY_EVIDENCE || join(tmpdir(), "wybp-random-quick-play-evidence");
const attemptId = `attempt_${"a".repeat(48)}`;
const questions = Array.from({ length: 12 }, (_, index) => ({
  questionRef: `west_review_${String(index + 1).padStart(2, "0")}`,
  version: 1,
  kind: index === 1 ? "image" : "single",
  text: index === 1 ? "Which reviewed image completes this regional fixture?" : `Fresh West Africa review question ${index + 1}`,
  options: ["o3", "o1", "o4", "o2"].map((id, optionIndex) => ({ id, text: index === 1 ? String.fromCharCode(65 + optionIndex) : [`Third choice`, `First choice`, `Fourth choice`, `Second choice`][optionIndex] })),
  imageAssets: index === 1 ? ["/quiz-art/west-2.webp", "/quiz-art/west-0.webp", "/quiz-art/west-3.webp", "/quiz-art/west-1.webp"] : [],
  imageDescriptions: index === 1 ? ["A neutral plate illustration with warm colours.", "A neutral woven object illustration with fine detail.", "A neutral carved object illustration on a plain field.", "A neutral vessel illustration with geometric decoration."] : [],
  audioAssets: [],
}));
const selection = { available: true, attemptId, questions, questionSetVersion: "approved-60-v1", scoringVersion: "binary-exact-set-v1", selectionPolicyVersion: "balanced-random-v2", expiresAt: Date.now() + 86_400_000 };

async function installRoutes(page: Page) {
  await page.route("**/questions/select", async (route: Route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(selection) }));
  await page.route("**/questions/resume", async (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(selection) }));
  await page.route("**/questions/answer", async (route: Route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ accepted: true, correct: body.selectedOptionIds.includes("o1"), correctOptionIds: ["o1"], explanation: "Server-authoritative review explanation." }) });
  });
}

test.beforeAll(async () => { await mkdir(evidence, { recursive: true }); });

test("fresh entry, shuffled text and image options, recovery and accessible states", async ({ page }) => {
  await installRoutes(page);
  await page.goto("/?edition=west");
  await expect(page.getByRole("button", { name: /start a fresh regional game/i })).toBeVisible();
  await page.screenshot({ path: join(evidence, "fresh-entry.png"), fullPage: true });
  await page.getByRole("button", { name: /start a fresh regional game/i }).click();
  await expect(page.getByRole("heading", { name: "Fresh West Africa review question 1" })).toBeVisible();
  await expect(page.locator(".answer-grid button b")).toHaveText(["Third choice", "First choice", "Fourth choice", "Second choice"]);
  await page.screenshot({ path: join(evidence, "shuffled-text-options.png"), fullPage: true });
  await page.locator(".answer-grid button").nth(1).click();
  await expect(page.getByText("Server-authoritative review explanation.")).toBeVisible();
  await page.getByRole("button", { name: /next challenge/i }).click();
  await expect(page.getByRole("heading", { name: /reviewed image completes/i })).toBeVisible();
  await expect(page.locator(".answer-grid button")).toHaveCount(4);
  await expect(page.locator(".answer-grid button").first()).toHaveAttribute("aria-label", /^Option A:/);
  await page.screenshot({ path: join(evidence, "shuffled-image-options.png"), fullPage: true });
  await page.reload();
  await expect(page.getByRole("heading", { name: /reviewed image completes/i })).toBeVisible();
  await expect(page.getByText(/restored after refresh/i)).toBeVisible();
  await page.screenshot({ path: join(evidence, "recovery-order.png"), fullPage: true });

  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: join(evidence, "layout-320.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: join(evidence, "zoom-200.png"), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.zoom = "1"; });
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.screenshot({ path: join(evidence, "keyboard-focus.png"), fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({ path: join(evidence, "reduced-motion.png"), fullPage: true });
});

test("controlled not-ready state keeps the honestly labelled classic fallback", async ({ page }) => {
  await page.route("**/questions/select", async (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ available: false, reason: "insufficient_published_bank", eligible: 12, required: 30, shortfall: 18 }) }));
  await page.goto("/?edition=west");
  await page.getByRole("button", { name: /start a fresh regional game/i }).click();
  await expect(page.getByText(/edition is 18 short/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Play the classic 12-question edition" })).toBeVisible();
  await page.screenshot({ path: join(evidence, "bank-not-ready.png"), fullPage: true });
});
