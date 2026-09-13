import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const evidenceDir = process.env.WYBP_OWNER_DASHBOARD_VISUAL_DIR || "";
const ownerHeaders = { "oai-authenticated-user-id": "review-owner", "oai-authenticated-user-email": "review@example.invalid" };

async function ownerContext(browser: Browser, options: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  return browser.newContext({ ...options, extraHTTPHeaders: { ...ownerHeaders, ...(options?.extraHTTPHeaders || {}) } });
}

async function screenshot(page: Page, name: string, fullPage = false) {
  if (evidenceDir) await page.screenshot({ path: join(evidenceDir, name), fullPage });
}

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { if (evidenceDir) await mkdir(evidenceDir, { recursive: true }); });
test.afterAll(async ({ request }) => { await request.post("/__preview__/shutdown"); });

test("unauthorised players see a neutral route and client values cannot grant access", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const response = await page.goto("/owner/analytics?fixture=healthy&owner=review-owner&owner_dashboard=true");
  expect(response?.status()).toBe(404);
  await expect(page.locator("[data-owner-dashboard]")).toHaveCount(0);
  await screenshot(page, "unauthorised-state.png");
  await context.close();
});

test("owner summary, funnel and target states remain aggregate and semantically distinct", async ({ browser }) => {
  const context = await ownerContext(browser, { viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); await page.goto("/owner/analytics?fixture=healthy");
  await expect(page.getByRole("heading", { name: "Funnel & viral coefficient" })).toBeVisible();
  await expect(page.getByText("Consented measured traffic only. This dashboard does not represent all players.")).toBeVisible();
  await screenshot(page, "owner-dashboard-summary.png");
  const funnel = page.getByRole("heading", { name: "Funnel", exact: true }); await funnel.scrollIntoViewIfNeeded(); await screenshot(page, "funnel-view.png");
  await expect(page.getByRole("table", { name: /Core funnel performance/ })).toBeVisible();
  await expect(page.getByText(/Handoffs are browser successes, not delivery, receipt or publication/).first()).toBeVisible();
  const source = await page.locator("body").innerText();
  expect(source).not.toMatch(/analytics_session_hash|properties_json|review-owner|client_event_uuid|\b[a-f0-9]{64}\b/i);
  await context.close();
});

test("viral below-target and exact-target fixtures never present target as observed", async ({ browser }) => {
  const context = await ownerContext(browser, { viewport: { width: 1280, height: 850 } }); const page = await context.newPage();
  await page.goto("/owner/analytics?fixture=below_target"); await page.getByRole("heading", { name: "Viral coefficient", exact: true }).scrollIntoViewIfNeeded(); await screenshot(page, "viral-below-target.png");
  await expect(page.locator(".owner-viral-equation")).not.toContainText("1.125");
  await page.goto("/owner/analytics?fixture=at_target"); await page.getByRole("heading", { name: "Viral coefficient", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.locator(".owner-viral-equation")).toContainText("2.5"); await expect(page.locator(".owner-viral-equation")).toContainText("45%"); await expect(page.locator(".owner-viral-equation")).toContainText("1.125");
  await expect(page.getByText(/This target is not observed performance/)).toBeVisible(); await screenshot(page, "viral-at-target.png"); await context.close();
});

test("channel and edition comparisons use exact identifiers and accessible tables", async ({ browser }) => {
  const context = await ownerContext(browser, { viewport: { width: 1280, height: 900 } }); const page = await context.newPage();
  await page.goto("/owner/analytics?fixture=channel_comparison"); const channel = page.getByRole("heading", { name: "Channel performance" }); await channel.scrollIntoViewIfNeeded();
  const table = page.getByRole("table", { name: "Aggregate controlled-channel outcomes" });
  await expect(table.getByRole("rowheader", { name: "instagram", exact: true })).toBeVisible(); await expect(table.getByRole("rowheader", { name: "instagram_story", exact: true })).toBeVisible();
  await expect(table.getByRole("rowheader", { name: "copy", exact: true })).toBeVisible(); await expect(table.getByRole("rowheader", { name: "copy_link", exact: true })).toBeVisible();
  await screenshot(page, "channel-comparison.png");
  await page.goto("/owner/analytics?fixture=multi_edition"); await page.getByRole("heading", { name: "Edition & attribution" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("table", { name: "Edition comparison" }).getByRole("rowheader", { name: "south" })).toBeVisible(); await screenshot(page, "edition-comparison.png");
  await context.close();
});

test("empty, small-sample, unavailable and CSV states are honest", async ({ browser }) => {
  const context = await ownerContext(browser, { viewport: { width: 1180, height: 850 } }); const page = await context.newPage();
  await page.goto("/owner/analytics?fixture=empty"); await expect(page.getByRole("heading", { name: "No data for these filters" })).toBeVisible(); await screenshot(page, "empty-state.png");
  await page.goto("/owner/analytics?fixture=small_sample"); await expect(page.getByText("small sample", { exact: true }).first()).toBeVisible(); await screenshot(page, "small-sample-state.png");
  await page.goto("/owner/analytics?fixture=d1_unavailable"); await expect(page.getByRole("heading", { name: "Analytics data is unavailable" })).toBeVisible(); await screenshot(page, "d1-unavailable-state.png");
  await page.goto("/owner/analytics?fixture=csv_export"); const link = page.getByRole("link", { name: "Export aggregate CSV" }); await link.focus(); await screenshot(page, "csv-export.png");
  const href = await link.getAttribute("href"); expect(href).toBeTruthy();
  const csvResponse = await context.request.get(href!, { headers: { "sec-fetch-site": "same-origin" } }); expect(csvResponse.status()).toBe(200);
  const csv = await csvResponse.text(); expect(csv).toContain('"dimension","gameMode"'); expect(csv).not.toMatch(/analytics_session_hash|properties_json|review-owner/i);
  await context.close();
});

test("320px, Android, iPhone, 200 percent zoom and reduced motion remain usable", async ({ browser }) => {
  for (const [name, viewport] of [["320-pixel-layout.png", { width: 320, height: 720 }], ["android-layout.png", { width: 360, height: 800 }], ["iphone-layout.png", { width: 390, height: 844 }]] as const) {
    const context = await ownerContext(browser, { viewport, isMobile: true, hasTouch: true }); const page = await context.newPage(); await page.goto("/owner/analytics?fixture=healthy");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const controls = await page.locator(".owner-filters :is(input:not([type=hidden]),select,button,a)").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height)); expect(Math.min(...controls)).toBeGreaterThanOrEqual(44);
    await screenshot(page, name); await context.close();
  }
  const zoomContext = await ownerContext(browser, { viewport: { width: 1280, height: 900 } }); const zoomPage = await zoomContext.newPage(); await zoomPage.goto("/owner/analytics?fixture=healthy"); await zoomPage.evaluate(() => { document.documentElement.style.zoom = "200%"; }); expect(await zoomPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); await screenshot(zoomPage, "200-percent-zoom.png"); await zoomContext.close();
  const reduced = await ownerContext(browser, { viewport: { width: 390, height: 844 }, reducedMotion: "reduce" }); const reducedPage = await reduced.newPage(); await reducedPage.goto("/owner/analytics?fixture=healthy"); expect(await reducedPage.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true); await screenshot(reducedPage, "reduced-motion-state.png"); await reduced.close();
});

test("keyboard focus, unsupported game mode and filter reset remain clear", async ({ browser }) => {
  const context = await ownerContext(browser, { viewport: { width: 1024, height: 900 } }); const page = await context.newPage(); await page.goto("/owner/analytics?fixture=healthy&edition=west&source=challenge");
  await expect(page.getByText("Unsupported by the current analytics data contract.").first()).toBeVisible(); await expect(page.locator('select[name="mode"]')).toHaveCount(0); await expect(page.locator('input[name="mode"]')).toHaveCount(0);
  await page.keyboard.press("Tab"); const focused = page.locator(":focus"); await expect(focused).toBeVisible();
  const outline = await focused.evaluate((element) => getComputedStyle(element).outlineStyle); expect(outline).not.toBe("none");
  await expect(page.getByRole("link", { name: "Reset filters" })).toHaveAttribute("href", "/owner/analytics");
  await page.goto("/owner/analytics"); await expect(page.locator('select[name="edition"]')).toHaveValue("all"); await context.close();
});
