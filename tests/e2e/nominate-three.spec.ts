import { expect, test, type BrowserContext, type Page } from "@playwright/test";

declare global {
  interface Window {
    __wybpNominationEvents?: Array<Record<string, unknown>>;
    __wybpShareCalls?: Array<Record<string, unknown>>;
    __wybpShareMode?: "success" | "cancel" | "fail";
    __wybpClipboardMode?: "success" | "fail";
    __wybpWindowMode?: "success" | "blocked";
  }
}

async function installShareHarness(context: BrowserContext) {
  await context.addInitScript(() => {
    window.__wybpNominationEvents = [];
    window.__wybpShareCalls = [];
    window.__wybpShareMode = "success";
    window.__wybpClipboardMode = "success";
    window.__wybpWindowMode = "success";
    window.addEventListener("wybp:nomination-event", (event) => {
      window.__wybpNominationEvents?.push({ ...(event as CustomEvent).detail });
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (payload: ShareData) => {
        window.__wybpShareCalls?.push({ channel: "native", ...payload });
        if (window.__wybpShareMode === "cancel") throw new DOMException("cancelled", "AbortError");
        if (window.__wybpShareMode === "fail") throw new Error("share failed");
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(text: string) {
          window.__wybpShareCalls?.push({ channel: "copy", text });
          if (window.__wybpClipboardMode === "fail") throw new Error("clipboard failed");
        },
      },
    });
    window.open = ((url?: string | URL) => {
      const call = { channel: "whatsapp", url: String(url || "") };
      window.__wybpShareCalls?.push(call);
      if (window.__wybpWindowMode === "blocked") return null;
      return {
        opener: null,
        close() {},
        location: { replace(destination: string) { call.url = String(destination); } },
      } as unknown as Window;
    }) as typeof window.open;
  });
}

function sharedText(call: Record<string, unknown>): string {
  if (call.channel !== "whatsapp") return `${String(call.text || "")}\n${String(call.url || "")}`;
  return new URL(String(call.url)).searchParams.get("text") || "";
}

async function openPreparedPanel(page: Page, name = "Ọlá") {
  await page.goto("/?safeguard_fixture=nomination-result");
  await page.getByRole("button", { name: "Nominate three people" }).click();
  const panel = page.locator("[data-nominate-three]");
  await expect(panel).toBeVisible();
  await page.getByLabel("Challenger name or pseudonym").fill(name);
  await page.getByRole("button", { name: "Prepare three nominations" }).click();
  await expect(panel).toHaveAttribute("data-mode", "personalised");
  await expect(page.getByText("One verified challenge is ready.")).toBeVisible();
  return panel;
}

test.describe.configure({ mode: "serial" });

test.afterAll(async ({ request }) => {
  await request.post("/__preview__/shutdown");
});

test("three mobile handoffs reuse one canonical challenge in under 30 seconds and remain shareable", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Instagram", hasTouch: true });
  await installShareHarness(context);
  const page = await context.newPage();
  const panel = await openPreparedPanel(page);
  await expect(panel.locator("[data-slot]")).toHaveCount(3);
  const started = Date.now();
  await panel.locator('[data-slot="1"]').getByRole("button", { name: "WhatsApp" }).click();
  await panel.locator('[data-slot="2"]').getByRole("button", { name: "Share menu" }).click();
  await panel.locator('[data-slot="3"]').getByRole("button", { name: "Copy link" }).click();
  const elapsedMs = Date.now() - started;
  expect(elapsedMs).toBeLessThan(30_000);
  await expect(page.getByText("Three nominations ready to travel. Keep the challenge going!")).toBeVisible();
  await expect(panel.locator('[data-slot-state="handed_off"]')).toHaveCount(3);

  const calls = await page.evaluate(() => window.__wybpShareCalls || []);
  const serialized = JSON.stringify(calls);
  const sharedPayloads = calls.map(sharedText);
  const codes = sharedPayloads.flatMap((payload) => [...payload.matchAll(/\/challenge\/([0-9a-f]{48})/g)].map((match) => match[1]));
  expect(codes.length).toBeGreaterThanOrEqual(3);
  expect(new Set(codes).size).toBe(1);
  for (const payload of sharedPayloads) expect(payload).toContain(`http://127.0.0.1:3100/challenge/${codes[0]}`);
  expect(serialized).toContain("Ọlá challenged you to beat 12/12 in the West Africa Edition. Can you protect the family reputation?");
  expect(serialized).toContain("A playful culture score, never a measure of human worth.");
  expect(serialized).not.toMatch(/nominated=1|photo|session|idempotency|revocation|recipient/i);

  let events = await page.evaluate(() => window.__wybpNominationEvents || []);
  expect(events.filter((event) => event.name === "share_intent")).toHaveLength(3);
  expect(events.filter((event) => event.name === "share_handoff")).toHaveLength(3);
  expect(JSON.stringify(events)).not.toMatch(/message_sent|delivery|Ọlá|score|code|url|session|token|photo/i);

  await panel.locator('[data-slot="1"]').getByRole("button", { name: "Copy link" }).click();
  events = await page.evaluate(() => window.__wybpNominationEvents || []);
  expect(events.filter((event) => event.name === "share_intent")).toHaveLength(4);
  expect(events.filter((event) => event.name === "share_handoff")).toHaveLength(3);
  await expect(page.getByText("Three nominations ready to travel. Keep the challenge going!")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Nominate three people" }).click();
  await expect(page.locator('[data-slot-state="handed_off"]')).toHaveCount(3);
  await expect(page.getByLabel("Challenger name or pseudonym")).toHaveValue("Ọlá");

  await page.getByLabel("Close nomination panel").click();
  await page.goto("/?edition=east");
  await page.goBack();
  await page.getByRole("button", { name: "Nominate three people" }).click();
  await expect(page.locator('[data-slot-state="handed_off"]')).toHaveCount(3);
  await expect(page.getByLabel("Challenger name or pseudonym")).toHaveValue("Ọlá");
  const landing = await context.newPage();
  await landing.goto(`http://127.0.0.1:3100/challenge/${codes[0]}`);
  await expect(landing.getByText("Ọlá has challenged you")).toBeVisible();
  await context.close();
});

test("cancelled, failed and blocked methods do not complete slots", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await installShareHarness(context);
  const page = await context.newPage();
  const panel = await openPreparedPanel(page);
  await page.evaluate(() => { window.__wybpShareMode = "cancel"; window.__wybpClipboardMode = "fail"; window.__wybpWindowMode = "blocked"; });
  await panel.locator('[data-slot="1"]').getByRole("button", { name: "Share menu" }).click();
  await expect(panel.locator('[data-slot="1"]')).toHaveAttribute("data-slot-state", "cancelled");
  await page.evaluate(() => { window.__wybpShareMode = "fail"; });
  await panel.locator('[data-slot="1"]').getByRole("button", { name: "Share menu" }).click();
  await expect(panel.locator('[data-slot="1"]')).toHaveAttribute("data-slot-state", "failed");
  await panel.locator('[data-slot="2"]').getByRole("button", { name: "Copy link" }).click();
  await expect(panel.locator('[data-slot="2"]')).toHaveAttribute("data-slot-state", "failed");
  await expect(panel.locator('[data-slot="2"] textarea')).toBeVisible();
  await panel.locator('[data-slot="3"]').getByRole("button", { name: "WhatsApp" }).click();
  await expect(panel.locator('[data-slot="3"]')).toHaveAttribute("data-slot-state", "failed");
  const events = await page.evaluate(() => window.__wybpNominationEvents || []);
  expect(events.filter((event) => event.name === "share_intent")).toHaveLength(4);
  expect(events.filter((event) => event.name === "share_handoff")).toHaveLength(0);
  await expect(page.getByText("Three nominations ready to travel. Keep the challenge going!")).toHaveCount(0);
  await context.close();
});

test("invalid names are rejected and the generic fallback creates no legacy link", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, hasTouch: true });
  await installShareHarness(context);
  const page = await context.newPage();
  await page.goto("/?safeguard_fixture=nomination-result");
  await page.getByRole("button", { name: "Nominate three people" }).click();
  await page.getByLabel("Challenger name or pseudonym").fill("<script>alert(1)</script>");
  await expect(page.getByRole("button", { name: "Prepare three nominations" })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("angle brackets");

  await page.goto("/?safeguard_fixture=safeguard-high-result");
  await page.getByRole("button", { name: "Nominate three people" }).click();
  const panel = page.locator("[data-nominate-three]");
  await expect(panel).toHaveAttribute("data-mode", "generic");
  await expect(panel.getByText("Regional invitation fallback")).toBeVisible();
  await panel.locator('[data-slot="1"]').getByRole("button", { name: "Copy link" }).click();
  const copied = await page.evaluate(() => window.__wybpShareCalls?.find((call) => call.channel === "copy")?.text as string);
  expect(copied).toContain("edition=west");
  expect(copied).not.toContain("nominated=1");
  expect(copied).not.toMatch(/challenged you to beat|score to beat/i);
  await context.close();
});

test("legacy nominated links remain neutral for valid, invalid and missing editions", async ({ page }) => {
  const started = Date.now();
  await page.goto("/?edition=west&nominated=1");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("YOU’VE BEEN NOMINATED");
  await expect(page.getByText("You have been nominated for the West Africa Edition.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start West Africa edition" })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(10_000);
  await expect(page.locator("body")).not.toContainText(/Score to beat|has challenged you/);

  for (const path of ["/?nominated=1", "/?edition=moon&nominated=1"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/CHOOSE YOUR\s*AFRICAN REGION/);
    await expect(page.getByText("You were nominated to play.")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Score to beat|has challenged you|database|stack/i);
  }
});

test("valid landing emits one referred_visit without accepting or leaking referral data", async ({ browser }) => {
  const context = await browser.newContext();
  await installShareHarness(context);
  const page = await context.newPage();
  let acceptancePosts = 0;
  page.on("request", (request) => { if (request.method() === "POST") acceptancePosts += 1; });
  await page.goto(`/challenge/${"7".repeat(48)}`);
  await expect(page.locator("[data-challenge-active]")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window.__wybpNominationEvents || []).length)).toBe(1);
  const events = await page.evaluate(() => window.__wybpNominationEvents || []);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ name: "referred_visit", surface: "challenge_landing", edition: "west" });
  expect(Object.keys(events[0]).sort()).toEqual(["edition", "elapsedMs", "name", "surface"]);
  expect(JSON.stringify(events)).not.toMatch(/Ọlá|code|url|referrer|session|token|photo|user-agent/i);
  expect(acceptancePosts).toBe(0);
  await context.close();
});

test("unavailable Web Share stays honest and leaves the other methods usable", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await installShareHarness(context);
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  });
  const page = await context.newPage();
  const panel = await openPreparedPanel(page);
  await expect(panel.getByRole("button", { name: "Share menu" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "WhatsApp" })).toHaveCount(3);
  await expect(panel.getByRole("button", { name: "Copy link" })).toHaveCount(3);
  await context.close();
});

test("320px, Android and iPhone layouts remain accessible and reduced-motion safe", async ({ browser }) => {
  for (const profile of [
    { width: 320, height: 568, userAgent: "Mozilla/5.0 Mobile" },
    { width: 360, height: 800, userAgent: "Mozilla/5.0 (Linux; Android 13) WhatsApp" },
    { width: 390, height: 844, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Instagram" },
    { width: 1024, height: 768, userAgent: "Mozilla/5.0 Desktop" },
  ]) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, userAgent: profile.userAgent, hasTouch: profile.width < 500 });
    await installShareHarness(context);
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?safeguard_fixture=safeguard-high-result");
    const primary = page.getByRole("button", { name: "Nominate three people" });
    await primary.focus();
    await expect(primary).toBeFocused();
    await primary.press("Enter");
    const panel = page.locator("[data-nominate-three]");
    await expect(panel.locator("[data-slot]")).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    for (const button of await panel.getByRole("button").all()) {
      const box = await button.boundingBox();
      if (box) expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await panel.evaluate((element) => getComputedStyle(element).animationDuration)).toBe("0s");
    await context.close();
  }
});
