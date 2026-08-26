import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const evidenceDir = process.env.WYBP_ANALYTICS_VISUAL_DIR || "";

declare global {
  interface Window { __wybpAnalyticsRequests?: Array<{ url: string; method: string; body: string | null }>; }
}

async function installHarness(context: BrowserContext, gpc = false) {
  await context.addInitScript(({ gpcEnabled }) => {
    window.__wybpAnalyticsRequests = [];
    if (gpcEnabled) Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, value: true });
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (new URL(request.url, location.href).pathname === "/analytics/events") {
        window.__wybpAnalyticsRequests?.push({ url: request.url, method: request.method, body: typeof init?.body === "string" ? init.body : null });
      }
      return original(input, init);
    };
  }, { gpcEnabled: gpc });
}

async function screenshot(page: Page, name: string) {
  if (evidenceDir) await page.screenshot({ path: join(evidenceDir, name), fullPage: false });
}

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { if (evidenceDir) await mkdir(evidenceDir, { recursive: true }); });
test.afterAll(async ({ request }) => { await request.post("/__preview__/shutdown"); });

test("no analytics identifier or transmission exists before consent; rejection leaves the quiz usable", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await installHarness(context);
  const page = await context.newPage(); await page.goto("/?edition=west&first_party_analytics=0");
  const consent = page.locator("[data-analytics-consent]"); await expect(consent).toBeVisible();
  const accept = consent.getByRole("button", { name: "Accept analytics" }); const reject = consent.getByRole("button", { name: "Reject analytics" });
  const [acceptBox, rejectBox] = await Promise.all([accept.boundingBox(), reject.boundingBox()]);
  expect(acceptBox?.height || 0).toBeGreaterThanOrEqual(44); expect(rejectBox?.height || 0).toBeGreaterThanOrEqual(44);
  expect(Math.abs((acceptBox?.width || 0) - (rejectBox?.width || 0))).toBeLessThanOrEqual(1);
  expect(await accept.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(await reject.evaluate((element) => getComputedStyle(element).backgroundColor));
  expect(await page.evaluate(() => ({ requests: window.__wybpAnalyticsRequests, session: sessionStorage.getItem("wybp-analytics-session-v1"), seen: sessionStorage.getItem("wybp-analytics-seen-v1"), cookies: document.cookie }))).toEqual({ requests: [], session: null, seen: null, cookies: "" });
  await screenshot(page, "initial-choice.png");
  await reject.click(); await expect(page.getByRole("button", { name: "Manage analytics preferences" })).toBeVisible();
  expect(await page.evaluate(() => ({ requests: window.__wybpAnalyticsRequests, session: sessionStorage.getItem("wybp-analytics-session-v1") }))).toEqual({ requests: [], session: null });
  await screenshot(page, "rejected-game-continues.png");
  await page.getByRole("button", { name: /Continue without a photo/ }).click(); await expect(page.locator(".hud-round")).toHaveText("Question 1 of 12");
  await context.close();
});

test("acceptance transmits first-party events and withdrawal clears the queue and optional identifier", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await installHarness(context);
  const page = await context.newPage(); await page.goto("/?edition=east");
  await page.getByRole("button", { name: "Accept analytics" }).click();
  await expect.poll(() => page.evaluate(() => window.__wybpAnalyticsRequests?.length || 0)).toBeGreaterThanOrEqual(2);
  const accepted = await page.evaluate(() => ({
    requests: window.__wybpAnalyticsRequests || [],
    session: sessionStorage.getItem("wybp-analytics-session-v1"),
    preference: localStorage.getItem("wybp-analytics-consent-v1"),
  }));
  expect(accepted.session).toMatch(/"credential":"[0-9a-f]{32}"/); expect(accepted.preference).toContain('"choice":"accepted"');
  expect(accepted.requests.every((request) => new URL(request.url, "http://127.0.0.1:3100").origin === "http://127.0.0.1:3100" && request.method === "POST")).toBe(true);
  expect(accepted.requests.map((request) => request.body).join(" ")).toContain("consent_accept"); expect(accepted.requests.map((request) => request.body).join(" ")).toContain("app_visit");
  expect(accepted.requests.map((request) => request.body).join(" ")).not.toMatch(/displayName|photo|answers|anonymousSession|subjectHash|ownership|revocation|token|https?:\/\//i);
  await screenshot(page, "accepted-state.png");
  await page.getByRole("button", { name: "Manage analytics preferences" }).click(); await expect(page.locator("[data-analytics-consent][data-choice=accepted]")).toBeVisible(); await screenshot(page, "manage-preferences.png");
  await page.getByRole("button", { name: "Reject analytics" }).click();
  await expect.poll(() => page.evaluate(() => window.__wybpAnalyticsRequests?.some((request) => request.body?.includes('"action":"withdraw"')))).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem("wybp-analytics-session-v1"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("wybp-analytics-consent-v1"))).toContain('"choice":"rejected"');
  await screenshot(page, "withdrawal-confirmation.png");
  expect(await context.cookies()).toEqual([]); await context.close();
});

test("Global Privacy Control rejects by default but permits a later explicit choice", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); await installHarness(context, true);
  const page = await context.newPage(); await page.goto("/");
  await expect(page.getByRole("button", { name: "Manage analytics preferences" })).toBeVisible();
  expect(await page.evaluate(() => ({ requests: window.__wybpAnalyticsRequests, session: sessionStorage.getItem("wybp-analytics-session-v1"), preference: localStorage.getItem("wybp-analytics-consent-v1") }))).toEqual({ requests: [], session: null, preference: null });
  await page.getByRole("button", { name: "Manage analytics preferences" }).click(); await page.getByRole("button", { name: "Accept analytics" }).click();
  await expect.poll(() => page.evaluate(() => window.__wybpAnalyticsRequests?.length || 0)).toBeGreaterThan(0); await context.close();
});

test("transport rejects cross-origin, missing Fetch Metadata, wrong content type and oversized requests", async ({ request }) => {
  const url = "http://127.0.0.1:3100/analytics/events";
  const validHeaders = { origin: "http://127.0.0.1:3100", "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "content-type": "application/json" };
  expect((await request.post(url, { headers: { ...validHeaders, origin: "https://attacker.example" }, data: {} })).status()).toBe(403);
  expect((await request.post(url, { headers: { origin: validHeaders.origin, "content-type": "application/json" }, data: {} })).status()).toBe(403);
  expect((await request.post(url, { headers: { ...validHeaders, "content-type": "text/plain" }, data: "{}" })).status()).toBe(415);
  expect((await request.post(url, { headers: validHeaders, data: { padding: "x".repeat(17_000) } })).status()).toBe(413);
  expect((await request.get(url)).status()).toBeGreaterThanOrEqual(400);
});

test("320px, Android, iPhone, 200 percent zoom, keyboard focus and reduced motion remain accessible", async ({ browser }) => {
  for (const profile of [{ name: "layout-320.png", width: 320, height: 700 }, { name: "layout-android.png", width: 360, height: 800 }, { name: "layout-iphone.png", width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, isMobile: true, hasTouch: true }); await installHarness(context); const page = await context.newPage(); await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1); await screenshot(page, profile.name); await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 780, height: 900 }, reducedMotion: "reduce" }); await installHarness(context); const page = await context.newPage(); await page.goto("/");
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; }); expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1); await screenshot(page, "zoom-200-percent.png");
  const focused = page.getByRole("button", { name: "Accept analytics" }); await focused.focus(); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab"); await expect(focused).toBeFocused(); expect(await focused.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none"); await screenshot(page, "keyboard-focus-reduced-motion.png");
  await context.close();
});
