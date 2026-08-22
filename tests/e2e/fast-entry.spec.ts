import { expect, test } from "@playwright/test";

const directWest = "/?edition=west&nominated=1&challenge=West_2026-A&source=whatsapp&utm_medium=social&utm_campaign=roots_2026&ref=Auntie-7";

test.describe.configure({ mode: "serial" });

test.afterAll(async ({ request }) => {
  await request.post("/__preview__/shutdown");
});

test("server HTML exposes the correct actionable regional shell before JavaScript", async ({ browser, request }) => {
  const response = await request.get(directWest);
  const html = await response.text();
  expect(html).toContain("data-fast-entry-shell");
  expect(html).toContain("YOU’VE BEEN NOMINATED");
  expect(html).toContain("West Africa");
  expect(html).not.toContain("Some link details were not recognised");

  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  await page.goto(directWest);
  await expect(page.locator("[data-fast-entry-shell]")).toBeVisible();
  await expect(page.getByRole("button", { name: /Enter West Africa/ })).toBeVisible();
  await context.close();
});

test("valid, legacy nomination and hostile context fail safely without raw reflection", async ({ page }) => {
  await page.goto("/?edition=EAST&nominated=1&source=InStaGram&challenge=East_2026-A");
  await expect(page.locator("[data-fast-entry-shell]")).toHaveAttribute("data-entry-source", "instagram");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("YOU’VE BEEN NOMINATED");
  await expect(page.getByRole("button", { name: /Enter East Africa/ })).toBeVisible();

  const hostile = encodeURIComponent("javascript:alert(1)");
  await page.goto(`/?edition=moon&challenge=${hostile}&ref=${encodeURIComponent("//evil.example")}&source=hostile`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/CHOOSE YOUR\s*AFRICAN REGION/);
  await expect(page.getByRole("status")).toContainText("safely ignored");
  await expect(page.locator("body")).not.toContainText("javascript:alert(1)");
  await expect(page.locator("[data-fast-entry-shell]")).toHaveAttribute("data-entry-source", "unknown");
});

test("navigation preserves permitted context, browser back and refresh", async ({ page }) => {
  await page.goto("/?source=facebook&utm_medium=social&utm_campaign=roots_2026&ref=Auntie-7&challenge=West_2026-A&nominated=1");
  await page.getByRole("button", { name: "West Africa" }).click();
  await expect(page.locator(".setup-stage")).toBeVisible();
  let url = new URL(page.url());
  expect(url.searchParams.get("edition")).toBe("west");
  expect(url.searchParams.get("source")).toBe("facebook");
  expect(url.searchParams.get("utm_campaign")).toBe("roots_2026");
  expect(url.searchParams.get("ref")).toBe("Auntie-7");
  expect(url.searchParams.get("challenge")).toBe("West_2026-A");
  expect(url.searchParams.get("nominated")).toBe("1");

  await page.reload();
  await expect(page.locator("[data-fast-entry-shell]")).toBeVisible();
  await expect(page.getByRole("button", { name: /Enter West Africa/ })).toBeVisible();
  url = new URL(page.url());
  expect(url.searchParams.get("edition")).toBe("west");
  expect(url.searchParams.get("utm_campaign")).toBe("roots_2026");
  await page.getByRole("button", { name: /Enter West Africa/ }).click();
  await expect(page.locator(".setup-stage")).toBeVisible();

  await page.goBack();
  await expect(page.locator("[data-fast-entry-shell]")).toBeVisible();
  url = new URL(page.url());
  expect(url.searchParams.get("edition")).toBe("west");
  expect(url.searchParams.get("utm_campaign")).toBe("roots_2026");
});

test("direct West loads one regional world, reaches avatars quickly and keeps sound behavior", async ({ page }) => {
  const regionalRequests = new Set<string>();
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/\/regions\/(?:west|east|central|north|southern)-africa\.webp$/.test(pathname)) regionalRequests.add(pathname);
  });
  const startedAt = Date.now();
  await page.goto(directWest);
  await expect(page.locator("[data-fast-entry-shell]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn sound off" })).toContainText("Sound on");
  await page.getByRole("button", { name: "Turn sound off" }).click();
  await expect(page.getByRole("button", { name: "Turn sound on" })).toContainText("Sound off");
  expect(regionalRequests).toEqual(new Set(["/regions/west-africa.webp"]));
  await page.getByRole("button", { name: /Enter West Africa/ }).click();
  await expect(page.getByRole("button", { name: /Choose Amara,/ })).toBeVisible();
  const entryToAvatarMs = Date.now() - startedAt;
  expect(entryToAvatarMs).toBeLessThan(10_000);
  expect(regionalRequests).toEqual(new Set(["/regions/west-africa.webp"]));
  console.log("FAST_ENTRY_AVATAR_EVIDENCE", JSON.stringify({ entryToAvatarMs, regionalRequests: [...regionalRequests] }));
});

test("artwork failure has a useful retry state and the game remains usable offline after load", async ({ page, context }) => {
  await page.route("**/regions/west-africa.webp*", (route) => route.abort());
  await page.goto(directWest);
  await expect(page.getByRole("status")).toContainText("game is still ready");
  await page.unroute("**/regions/west-africa.webp*");
  await page.getByRole("button", { name: "Retry artwork" }).click();
  await expect(page.locator(".fast-entry-art img")).toBeVisible();

  await context.setOffline(true);
  await page.getByRole("button", { name: /Enter West Africa/ }).click();
  await expect(page.locator(".setup-copy h1")).toContainText("West Africa");
  await expect(page.getByRole("button", { name: /Enter Region 01/ })).toBeVisible();
  await context.setOffline(false);
});

test("blocked device storage does not prevent entry", async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem"] as const) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value() { throw new DOMException("Storage blocked", "SecurityError"); },
      });
    }
  });
  await page.goto(directWest);
  await page.getByRole("button", { name: /Enter West Africa/ }).click();
  await expect(page.locator(".setup-stage")).toBeVisible();
});

test("entry does not construct audio before a user gesture", async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { __wybpAudioContexts?: number }).__wybpAudioContexts = 0;
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: function AudioContextProbe() {
        (window as Window & { __wybpAudioContexts?: number }).__wybpAudioContexts! += 1;
      },
    });
  });
  await page.goto(directWest);
  await expect(page.locator("[data-fast-entry-shell]")).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __wybpAudioContexts?: number }).__wybpAudioContexts)).toBe(0);
});

test("four social in-app browser profiles enter without external runtime requests", async ({ browser }) => {
  const profiles = [
    ["WhatsApp", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/116 Mobile Safari/537.36 WhatsApp", "whatsapp"],
    ["Facebook", "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Mobile Safari/537.36 [FBAN/EMA]", "facebook"],
    ["Instagram", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile Instagram", "instagram"],
    ["TikTok", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile TikTok", "tiktok"],
  ] as const;
  for (const [label, userAgent, source] of profiles) {
    const context = await browser.newContext({ userAgent, viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
    const pageErrors: string[] = [];
    const externalRequests: string[] = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
    });
    await page.goto(`/?edition=west&source=${source}`);
    await expect(page.locator("[data-fast-entry-shell]"), label).toBeVisible();
    await page.getByRole("button", { name: /Enter West Africa/ }).click();
    await expect(page.locator(".setup-stage"), label).toBeVisible();
    expect(pageErrors, label).toEqual([]);
    expect(externalRequests, label).toEqual([]);
    await context.close();
  }
});

test("mid-range mobile entry meets timing and layout-shift budgets", async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 6a) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    (window as Window & { __wybpCls?: number }).__wybpCls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
        if (!entry.hadRecentInput) (window as Window & { __wybpCls?: number }).__wybpCls! += entry.value || 0;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/?edition=east&source=whatsapp");
  await expect(page.locator("[data-fast-entry-shell]")).toBeVisible();
  await page.goto(directWest);
  await expect(page.locator("[data-fast-entry-shell]")).toBeVisible();
  const measures = await page.evaluate(() => ({
    shell: performance.getEntriesByName("wybp:entry_shell_visible").at(-1)?.startTime || Infinity,
    interactive: performance.getEntriesByName("wybp:entry_interactive").at(-1)?.startTime || Infinity,
    cls: (window as Window & { __wybpCls?: number }).__wybpCls || 0,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  expect(measures.shell).toBeLessThan(1_500);
  expect(measures.interactive).toBeLessThan(3_000);
  expect(measures.cls).toBeLessThan(0.1);
  expect(measures.overflow).toBeLessThanOrEqual(1);
  console.log("FAST_ENTRY_PERFORMANCE_EVIDENCE", JSON.stringify({ ...measures, conditions: "Microsoft Edge Android mobile emulation, 360x800 at 2x DPR, touch enabled, 4x CPU slowdown, local warm application cache, no network throttling" }));
  await context.close();
});

test("first-party hooks remain browser-local and use only approved names", async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { __wybpEntryEventNames?: string[] }).__wybpEntryEventNames = [];
    window.addEventListener("wybp:entry-event", (event) => {
      (window as Window & { __wybpEntryEventNames?: string[] }).__wybpEntryEventNames?.push((event as CustomEvent<{ name: string }>).detail.name);
    });
  });
  await page.goto("/?edition=invalid&source=unknown");
  await expect.poll(() => page.evaluate(() => (window as Window & { __wybpEntryEventNames?: string[] }).__wybpEntryEventNames)).toEqual(expect.arrayContaining([
    "entry_view", "entry_context_invalid", "entry_shell_visible", "entry_interactive",
  ]));
});

test("320px, keyboard, safe-area and reduced-motion paths remain accessible", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(directWest);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  const primary = page.getByRole("button", { name: /Enter West Africa/ });
  const box = await primary.boundingBox();
  expect(box?.height || 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Tab");
  const focusedOutline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(focusedOutline).not.toBe("none");
  const animation = await page.locator(".fast-entry-shell").evaluate((element) => getComputedStyle(element).animationName);
  expect(animation).toBe("none");
  await primary.click();
  const nameInput = page.getByLabel("What should we call you?");
  await nameInput.focus();
  await expect(nameInput).toBeInViewport();
});

test("production review output does not expose diagnostics or a query-string toggle", async ({ page }) => {
  await page.goto(`${directWest}&diagnostics=1`);
  await expect(page.locator("[data-fast-entry-shell]")).toBeVisible();
  await expect(page.locator("[data-entry-diagnostics]")).toHaveCount(0);
});
