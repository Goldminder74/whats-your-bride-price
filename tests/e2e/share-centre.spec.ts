import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { regions } from "../../app/gameData";

declare global {
  interface Window {
    __wybpShareCentreEvents?: Array<Record<string, unknown>>;
    __wybpPlatformCalls?: Array<Record<string, unknown>>;
    __wybpShareMode?: "success" | "cancel" | "fail";
    __wybpCanShareFiles?: boolean;
    __wybpPopupBlocked?: boolean;
    __wybpClipboardBlocked?: boolean;
  }
}

async function installHarness(context: BrowserContext) {
  await context.addInitScript(() => {
    window.__wybpShareCentreEvents = [];
    window.__wybpPlatformCalls = [];
    window.__wybpShareMode = "success";
    window.__wybpCanShareFiles = true;
    window.__wybpPopupBlocked = false;
    window.__wybpClipboardBlocked = false;
    window.addEventListener("wybp:share-centre-event", (event) => {
      window.__wybpShareCentreEvents?.push({ ...(event as CustomEvent).detail });
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => window.__wybpCanShareFiles === true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (payload: ShareData) => {
        window.__wybpPlatformCalls?.push({
          channel: "native",
          title: payload.title,
          text: payload.text,
          url: payload.url,
          files: payload.files?.map((file) => ({ name: file.name, type: file.type, size: file.size })),
        });
        if (window.__wybpShareMode === "cancel") throw new DOMException("cancelled", "AbortError");
        if (window.__wybpShareMode === "fail") throw new Error("share failed");
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { async writeText(text: string) { window.__wybpPlatformCalls?.push({ channel: "copy", text }); if (window.__wybpClipboardBlocked) throw new Error("clipboard blocked"); } },
    });
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      window.__wybpPlatformCalls?.push({ channel: "popup", url: String(url || ""), target, features, blocked: window.__wybpPopupBlocked });
      return window.__wybpPopupBlocked ? null : ({ closed: false } as Window);
    }) as typeof window.open;
  });
}

async function completeChallengeQuiz(page: Page) {
  await page.goto(`/challenge/${"1".repeat(48)}`);
  await page.getByRole("button", { name: "Accept challenge" }).click();
  await page.getByRole("button", { name: "Continue without a photo" }).click();
  for (const [questionIndex, question] of regions.west.questions.entries()) {
    const buttons = page.locator(".answer-grid > button");
    for (const option of question.correct) await buttons.nth(option).click();
    if (question.kind === "multi") await page.getByRole("button", { name: /Lock in 3\/3 answers/ }).click();
    await page.locator(".answer-reveal").getByRole("button", { name: questionIndex === 11 ? /Reveal my result/ : /Next challenge/ }).click({ force: true });
    if (questionIndex < 11 && (questionIndex + 1) % 3 === 0) await page.getByRole("button", { name: /Claim gem/ }).click();
  }
  await expect(page.locator(".challenge-comparison")).toBeVisible();
}

function pngDimensions(buffer: Buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test.describe.configure({ mode: "serial" });

test.afterAll(async ({ request }) => {
  await request.post("/__preview__/shutdown");
});

test("mobile result Share Centre reuses one challenge and supports every explicit action", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 Mobile Instagram" });
  await installHarness(context);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?safeguard_fixture=nomination-result");
  await page.getByLabel("Name or pseudonym on your portrait").fill("Ọlá");
  const trigger = page.getByRole("button", { name: "Open Share Centre" }).last();
  await trigger.click();
  const centre = page.locator("[data-share-centre]");
  await expect(centre).toBeVisible();
  await expect(centre).toHaveAttribute("data-share-surface", "result");
  await expect(centre).toHaveAttribute("data-share-mode", "personalised");
  await expect(page.getByRole("button", { name: "Close Share Centre" })).toBeFocused();
  await expect(centre).toContainText("A playful culture score, never a measure of human worth.");
  await expect(centre.getByRole("button")).toHaveCount(8);
  await expect(centre).toHaveAttribute("data-media-ready", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  await centre.getByRole("button", { name: /Copy link/ }).click();
  await expect(centre.getByRole("status")).toContainText("Safe link copied");
  const copied = await page.evaluate(() => String(window.__wybpPlatformCalls?.find((call) => call.channel === "copy")?.text || ""));
  expect(copied).toBe(`http://127.0.0.1:3100/challenge/${"7".repeat(48)}`);

  await page.evaluate(() => { window.__wybpPopupBlocked = true; });
  await centre.getByRole("button", { name: /WhatsApp/ }).click();
  await expect(centre.getByRole("status")).toContainText("safe link was copied instead");
  await centre.getByRole("button", { name: /Facebook/ }).click();
  await expect(centre.getByRole("status")).toContainText("safe link was copied instead");
  await page.evaluate(() => { window.__wybpPopupBlocked = false; });
  await centre.getByRole("button", { name: /WhatsApp/ }).click();
  await centre.getByRole("button", { name: /Facebook/ }).click();
  const popups = await page.evaluate(() => window.__wybpPlatformCalls?.filter((call) => call.channel === "popup" && call.blocked === false) || []);
  expect(popups).toHaveLength(2);
  for (const popup of popups) expect(popup.features).toContain("noopener,noreferrer");
  const whatsappText = new URL(String(popups[0].url)).searchParams.get("text") || "";
  expect(whatsappText).toContain("Ọlá challenged you to beat 12/12 in the West Africa Edition.");
  expect(whatsappText.match(/\/challenge\//g)).toHaveLength(1);
  expect(new URL(String(popups[1].url)).searchParams.get("u")).toBe(copied);

  await centre.getByRole("button", { name: /Native share/ }).click();
  await expect(centre.getByRole("status")).toContainText("share sheet completed its handoff");
  await page.evaluate(() => { window.__wybpShareMode = "cancel"; });
  await centre.getByRole("button", { name: /Native share/ }).click();
  await expect(centre.getByRole("status")).toContainText("Share cancelled");
  await page.evaluate(() => { window.__wybpShareMode = "fail"; });
  await centre.getByRole("button", { name: /Native share/ }).click();
  await expect(centre.getByRole("status")).toContainText("could not complete");
  await page.evaluate(() => { window.__wybpShareMode = "success"; });
  await centre.getByRole("button", { name: /Instagram Story/ }).click();
  await expect(centre.getByRole("status")).toContainText("device share sheet completed its handoff");
  await centre.getByRole("button", { name: /^TikTok/ }).click();
  await expect(centre.getByRole("status")).toContainText("device share sheet completed its handoff");

  await page.evaluate(() => { window.__wybpCanShareFiles = false; });
  const instagramDownload = page.waitForEvent("download");
  await centre.getByRole("button", { name: /Instagram Story/ }).click();
  expect((await instagramDownload).suggestedFilename()).toBe("bride-price-west-story.png");
  await expect(centre.getByRole("status").getByRole("listitem")).toHaveCount(2);
  await expect(centre.getByRole("status")).toContainText("Open Instagram and create a Story.");
  const tiktokDownload = page.waitForEvent("download");
  await centre.getByRole("button", { name: /^TikTok/ }).click();
  const downloadedTikTok = await tiktokDownload;
  expect(downloadedTikTok.suggestedFilename()).toBe("bride-price-west-story.png");
  await expect(centre.getByRole("status").getByRole("listitem")).toHaveCount(2);
  await expect(centre.getByRole("status")).toContainText("Open TikTok and start a new post or Story.");

  await page.evaluate(() => { window.__wybpClipboardBlocked = true; });
  await centre.getByRole("button", { name: /Copy link/ }).click();
  await expect(centre.getByLabel("Manual safe link")).toHaveValue(copied);
  await page.evaluate(() => { window.__wybpClipboardBlocked = false; });

  const portraitDownload = page.waitForEvent("download");
  await centre.getByRole("button", { name: /Download portrait/ }).click();
  const portrait = await portraitDownload;
  const portraitPath = await portrait.path();
  expect(portraitPath).not.toBeNull();
  const buffer = await import("node:fs/promises").then(({ readFile }) => readFile(portraitPath!));
  expect(buffer.subarray(1, 4).toString()).toBe("PNG");
  expect(pngDimensions(buffer)).toEqual({ width: 1080, height: 1920 });

  const events = await page.evaluate(() => window.__wybpShareCentreEvents || []);
  expect(events.some((event) => event.name === "share_cancelled")).toBe(true);
  expect(events.some((event) => event.name === "share_download_started")).toBe(true);
  expect(events.filter((event) => event.name === "share_media_prepared")).toHaveLength(1);
  expect(JSON.stringify(events)).not.toMatch(/Ọlá|score|code|url|session|token|photo|recipient/i);

  await page.keyboard.press("Escape");
  await expect(centre).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: /Nominate three people/ }).first().click();
  await expect(page.locator("[data-nominate-three]")).toHaveAttribute("data-mode", "personalised");
  await expect(page.getByText("Your existing verified challenge is ready again.")).toBeVisible();
  await page.locator('[data-slot="1"]').getByRole("button", { name: "Copy link" }).click();
  const copiedLinks = await page.evaluate(() => (window.__wybpPlatformCalls || []).filter((call) => call.channel === "copy").map((call) => call.text));
  expect(String(copiedLinks.at(-1))).toContain(copied);
  expect(String(copiedLinks.at(-1)).match(/\/challenge\/[0-9a-f]{48}/g)).toHaveLength(1);
  await context.close();
});

test("valid challenge landing Share Centre uses its canonical projection without GET writes", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await installHarness(context);
  const page = await context.newPage();
  let posts = 0;
  page.on("request", (request) => { if (request.method() === "POST") posts += 1; });
  await page.goto(`/challenge/${"7".repeat(48)}`);
  await page.getByRole("button", { name: /Open Share Centre/ }).click();
  const centre = page.locator("[data-share-centre]");
  await expect(centre).toHaveAttribute("data-share-surface", "challenge_landing");
  await expect(centre).toHaveAttribute("data-share-mode", "personalised");
  await centre.getByRole("button", { name: /Copy link/ }).click();
  const copied = await page.evaluate(() => String(window.__wybpPlatformCalls?.find((call) => call.channel === "copy")?.text || ""));
  expect(copied).toBe(page.url());
  expect(posts).toBe(0);
  await context.close();
});

test("comparison Share Centre falls back honestly while durable challenge creation is unavailable", async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await installHarness(context);
  const page = await context.newPage();
  await completeChallengeQuiz(page);
  await page.locator(".challenge-comparison").getByRole("button", { name: "Open Share Centre" }).click();
  const centre = page.locator("[data-share-centre]");
  await expect(centre).toHaveAttribute("data-share-surface", "comparison");
  await expect(centre).toHaveAttribute("data-share-mode", "generic");
  await expect(centre).toContainText("no invented inviter identity or score");
  await centre.getByRole("button", { name: /Copy link/ }).click();
  const copied = await page.evaluate(() => String(window.__wybpPlatformCalls?.find((call) => call.channel === "copy")?.text || ""));
  expect(copied).toContain("edition=west");
  expect(copied).not.toContain("nominated=1");
  await context.close();
});

test("Share Centre remains usable on desktop, Android, iPhone and 200 percent zoom", async ({ browser }) => {
  for (const profile of [
    { viewport: { width: 1280, height: 800 }, mobile: false },
    { viewport: { width: 360, height: 800 }, mobile: true },
    { viewport: { width: 390, height: 844 }, mobile: true },
  ]) {
    const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.mobile, hasTouch: profile.mobile });
    await installHarness(context);
    const page = await context.newPage();
    await page.goto(`/challenge/${"7".repeat(48)}`);
    await page.getByRole("button", { name: /Open Share Centre/ }).click();
    await expect(page.locator("[data-share-centre]")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await context.close();
  }
  const zoomContext = await browser.newContext({ viewport: { width: 640, height: 900 } });
  await installHarness(zoomContext);
  const zoomPage = await zoomContext.newPage();
  await zoomPage.goto(`/challenge/${"7".repeat(48)}`);
  await zoomPage.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await zoomPage.getByRole("button", { name: /Open Share Centre/ }).click();
  await expect(zoomPage.getByRole("button", { name: /Copy link/ })).toBeVisible();
  await expect(zoomPage.locator("[data-share-centre]")).toContainText("How platform sharing works");
  await zoomContext.close();
});
