import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

declare global {
  interface Window {
    __wybpStoryEvents?: Array<Record<string, unknown>>;
    __wybpStoryShares?: Array<Record<string, unknown>>;
    __wybpStoryShareMode?: "success" | "cancel" | "fail";
    __wybpStoryCanShare?: boolean;
    __wybpCanShareCalls?: number;
    __wybpRevokedStoryUrls?: number;
  }
}

const evidenceDir = process.env.WYBP_STORY_VISUAL_DIR || "";
const profiles = [
  { label: "west-high", code: "7".repeat(48), edition: "west", score: 12 },
  { label: "east-middle", code: "8f".repeat(24), edition: "east", score: 8 },
  { label: "north-learning", code: "9f".repeat(24), edition: "north", score: 4 },
] as const;

async function installHarness(context: BrowserContext) {
  await context.addInitScript(() => {
    window.__wybpStoryEvents = []; window.__wybpStoryShares = []; window.__wybpStoryShareMode = "success"; window.__wybpStoryCanShare = true; window.__wybpCanShareCalls = 0; window.__wybpRevokedStoryUrls = 0;
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => { window.__wybpRevokedStoryUrls = (window.__wybpRevokedStoryUrls || 0) + 1; revokeObjectURL(url); };
    window.addEventListener("wybp:story-video-event", (event) => window.__wybpStoryEvents?.push({ ...(event as CustomEvent).detail }));
    Object.defineProperty(navigator, "canShare", { configurable: true, value: (payload: ShareData) => { window.__wybpCanShareCalls = (window.__wybpCanShareCalls || 0) + 1; return window.__wybpStoryCanShare === true && Boolean(payload.files?.length); } });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (payload: ShareData) => {
      window.__wybpStoryShares?.push({ title: payload.title, text: payload.text, files: payload.files?.map((file) => ({ name: file.name, type: file.type, size: file.size })) });
      if (window.__wybpStoryShareMode === "cancel") throw new DOMException("cancelled", "AbortError");
      if (window.__wybpStoryShareMode === "fail") throw new Error("share failed");
    } });
  });
}

async function openStory(page: Page, code: string) {
  await page.goto(`/challenge/${code}`);
  await page.getByRole("button", { name: /Open Share Centre/ }).click();
  const centre = page.locator("[data-share-centre]"); await expect(centre).toBeVisible();
  await centre.getByRole("button", { name: /Create Story video/ }).click();
  const panel = centre.locator("[data-story-video]"); await expect(panel).toBeVisible();
  await expect(panel.locator("canvas")).toHaveAttribute("width", "1080"); await expect(panel.locator("canvas")).toHaveAttribute("height", "1920");
  await expect(panel).toContainText("A playful culture score, never a measure of human worth.");
  await panel.scrollIntoViewIfNeeded();
  return { centre, panel };
}

function dimensions(buffer: Buffer) { return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }; }

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { if (evidenceDir) await mkdir(evidenceDir, { recursive: true }); });
test.afterAll(async ({ request }) => { await request.post("/__preview__/shutdown"); });

test("three regional results render, record for about five seconds and stay below 8 MB", async ({ browser }) => {
  test.setTimeout(90_000);
  const evidence: Array<Record<string, unknown>> = [];
  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await installHarness(context);
    const page = await context.newPage(); const nonReadRequests: string[] = []; page.on("request", (request) => { if (!['GET', 'HEAD'].includes(request.method())) nonReadRequests.push(`${request.method()} ${request.url()}`); });
    const { panel } = await openStory(page, profile.code);
    await expect(panel.locator("canvas")).toHaveAttribute("aria-label", new RegExp(`${profile.score} out of 12`, "i"));
    if (evidenceDir) await page.screenshot({ path: join(evidenceDir, `${profile.label}.png`), fullPage: false });
    await panel.getByRole("button", { name: "Generate five-second video" }).click();
    await expect(panel).toHaveAttribute("data-story-video-state", "ready", { timeout: 15_000 });
    const metadata = await panel.evaluate((element) => ({ mime: element.getAttribute("data-video-mime") || "", bytes: Number(element.getAttribute("data-video-size")), duration: Number(element.getAttribute("data-video-duration")), audio: element.getAttribute("data-audio-included") }));
    expect(metadata.duration).toBeGreaterThanOrEqual(4800); expect(metadata.duration).toBeLessThan(5800); expect(metadata.bytes).toBeGreaterThan(1000); expect(metadata.bytes).toBeLessThanOrEqual(8_000_000);
    const expectedExtension = metadata.mime.startsWith("video/mp4") ? "mp4" : "webm";
    const downloadPromise = page.waitForEvent("download"); await panel.getByRole("button", { name: "Download video" }).click(); const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`bride-price-${profile.edition}-story-video.${expectedExtension}`);
    const destination = evidenceDir ? join(evidenceDir, download.suggestedFilename()) : await download.path(); if (evidenceDir) await download.saveAs(destination!);
    const fileBuffer = await readFile(destination!); expect(fileBuffer.length).toBe(metadata.bytes); expect(fileBuffer.length).toBeLessThanOrEqual(8_000_000);
    if (profile.edition === "west" && evidenceDir) await page.screenshot({ path: join(evidenceDir, "video-ready-share-centre.png"), fullPage: false });
    evidence.push({ ...profile, ...metadata, extension: expectedExtension, path: destination });
    expect(nonReadRequests).toEqual([]);
    await context.close();
  }
  console.log(`PROMPT15_MEDIA_EVIDENCE ${JSON.stringify(evidence)}`);
});

test("native file sharing checks capability and cancelled sharing never records a handoff", async ({ browser }) => {
  test.setTimeout(35_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await installHarness(context);
  const page = await context.newPage(); const { panel } = await openStory(page, profiles[0].code);
  await panel.getByRole("button", { name: "Generate five-second video" }).click(); await expect(panel).toHaveAttribute("data-story-video-state", "rendering");
  await panel.getByRole("button", { name: "Cancel generation" }).click(); await expect(panel).toHaveAttribute("data-story-video-state", "cancelled");
  await expect(panel.getByRole("status")).toContainText("generation cancelled");
  await panel.getByRole("button", { name: "Generate five-second video" }).click(); await expect(panel).toHaveAttribute("data-story-video-state", "ready", { timeout: 15_000 });
  await panel.getByRole("button", { name: "Share video" }).click(); await expect(panel.getByRole("status")).toContainText("share sheet completed its handoff");
  const firstEvents = await page.evaluate(() => window.__wybpStoryEvents || []); expect(firstEvents.filter((event) => event.name === "story_video_share_handoff")).toHaveLength(1); expect(await page.evaluate(() => window.__wybpCanShareCalls)).toBeGreaterThan(0);
  await page.evaluate(() => { window.__wybpStoryShareMode = "cancel"; }); await panel.getByRole("button", { name: "Share video" }).click(); await expect(panel.getByRole("status")).toContainText("Sharing cancelled");
  const finalEvents = await page.evaluate(() => window.__wybpStoryEvents || []); expect(finalEvents.filter((event) => event.name === "story_video_share_handoff")).toHaveLength(1); expect(JSON.stringify(finalEvents)).not.toMatch(/Ọlá|credential|subjectHash|resultSlug|challengeCode|https?:|blob:|photo|answers|token/i);
  const downloadPromise = page.waitForEvent("download"); await panel.getByRole("button", { name: "Download video" }).click(); await downloadPromise; await page.waitForTimeout(20);
  expect(await page.evaluate(() => window.__wybpRevokedStoryUrls)).toBeGreaterThan(0);
  await context.close();
});

test("reduced motion pauses preview and unsupported recording keeps a static 9:16 fallback", async ({ browser }) => {
  const reducedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await installHarness(reducedContext);
  const reducedPage = await reducedContext.newPage(); await reducedPage.emulateMedia({ reducedMotion: "reduce" }); const reduced = await openStory(reducedPage, profiles[0].code);
  await expect(reduced.panel).toHaveAttribute("data-reduced-motion", "true"); await expect(reduced.panel).toContainText("Motion is paused");
  const firstFrame = await reduced.panel.locator("canvas").evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL()); await reducedPage.waitForTimeout(180); const secondFrame = await reduced.panel.locator("canvas").evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL()); expect(secondFrame).toBe(firstFrame);
  if (evidenceDir) await reducedPage.screenshot({ path: join(evidenceDir, "reduced-motion-static.png"), fullPage: false }); await reducedContext.close();

  const unsupportedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await installHarness(unsupportedContext);
  await unsupportedContext.addInitScript(() => { if (typeof MediaRecorder === "function") Object.defineProperty(MediaRecorder, "isTypeSupported", { configurable: true, value: () => false }); });
  const unsupportedPage = await unsupportedContext.newPage(); const unsupported = await openStory(unsupportedPage, profiles[1].code);
  await expect(unsupported.panel).toHaveAttribute("data-supported-mime", "none"); await unsupported.panel.getByRole("button", { name: "Generate five-second video" }).click(); await expect(unsupported.panel).toHaveAttribute("data-story-video-state", "unsupported");
  if (evidenceDir) await unsupportedPage.screenshot({ path: join(evidenceDir, "unsupported-video-fallback.png"), fullPage: false });
  const fallbackDownload = unsupportedPage.waitForEvent("download"); await unsupported.panel.getByRole("button", { name: "Use static Story image instead" }).click(); const fallback = await fallbackDownload; expect(fallback.suggestedFilename()).toBe("bride-price-east-story-static.png"); const fallbackPath = await fallback.path(); const buffer = await readFile(fallbackPath!); expect(dimensions(buffer)).toEqual({ width: 1080, height: 1920 });
  await unsupportedContext.close();
});

test("320-pixel, Android, iPhone and 200 percent zoom layouts remain accessible", async ({ browser }) => {
  for (const profile of [{ label: "layout-320", viewport: { width: 320, height: 700 } }, { label: "layout-android", viewport: { width: 360, height: 800 } }, { label: "layout-iphone", viewport: { width: 390, height: 844 } }]) {
    const { viewport } = profile;
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true }); await installHarness(context); const page = await context.newPage(); const { panel } = await openStory(page, profiles[2].code);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1); const box = await panel.getByRole("button", { name: "Generate five-second video" }).boundingBox(); expect(box?.height || 0).toBeGreaterThanOrEqual(44); if (evidenceDir) await page.screenshot({ path: join(evidenceDir, `${profile.label}.png`), fullPage: false }); await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 780, height: 900 } }); await installHarness(context); const page = await context.newPage(); await page.goto(`/challenge/${profiles[1].code}`); await page.evaluate(() => { document.documentElement.style.zoom = "2"; }); await page.getByRole("button", { name: /Open Share Centre/ }).click(); await page.getByRole("button", { name: /Create Story video/ }).click(); await expect(page.getByRole("button", { name: "Generate five-second video" })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1); if (evidenceDir) await page.screenshot({ path: join(evidenceDir, "zoom-200-percent.png"), fullPage: false }); await context.close();
});
