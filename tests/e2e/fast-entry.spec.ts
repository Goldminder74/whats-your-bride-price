import { expect, test } from "@playwright/test";

const directWest = "/?edition=west&source=whatsapp&utm_medium=social&utm_campaign=roots_2026&ref=Auntie-7";

test.describe.configure({ mode: "serial" });

test.afterAll(async ({ request }) => {
  await request.post("/__preview__/shutdown");
});

test("generic entry offers all regions without loading regional or avatar art", async ({ page }) => {
  const artRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/regions/") || pathname.startsWith("/avatars/")) artRequests.push(pathname);
  });
  await page.goto("/");
  await expect(page.locator("[data-fast-entry-shell]")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/CHOOSE YOUR\s*AFRICAN REGION/);
  await expect(page.getByText("A playful culture score, never a measure of human worth.")).toBeVisible();
  for (const name of ["West Africa", "East Africa", "Central Africa", "North Africa", "Southern Africa"]) {
    const regionButton = page.getByRole("button", { name });
    await expect(regionButton).toBeVisible();
    await expect(regionButton).toHaveAttribute("aria-describedby", "generic-entry-safeguard");
  }
  expect(artRequests).toEqual([]);
});

test("direct West server-renders the compact avatar choice with no generic flash", async ({ browser, page, request }) => {
  const response = await request.get(directWest);
  const html = await response.text();
  expect(html).toContain("data-fast-avatar");
  expect(html).toContain("CHOOSE YOUR");
  expect(html).toContain("PLAYER");
  expect(html).not.toContain("AFRICAN REGION");

  const noScriptContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 800 } });
  const noScriptPage = await noScriptContext.newPage();
  await noScriptPage.goto(directWest);
  await expect(noScriptPage.locator("[data-fast-avatar]")).toBeVisible();
  await expect(noScriptPage.getByRole("button", { name: "Continue without a photo" })).toBeVisible();
  await noScriptContext.close();

  const regionalRequests = new Set<string>();
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/\/regions\/(?:west|east|central|north|southern)-africa\.webp$/.test(pathname)) regionalRequests.add(pathname);
  });
  const startedAt = Date.now();
  await page.goto(directWest);
  await expect(page.locator("[data-fast-avatar]")).toBeVisible();
  await expect(page.locator("#avatar-entry-safeguard")).toHaveText("A playful culture score, never a measure of human worth.");
  await expect(page.getByRole("button", { name: "Continue without a photo" })).toHaveAttribute("aria-describedby", "avatar-entry-safeguard");
  await expect(page.getByRole("button", { name: /Choose a private photo/ })).toHaveAttribute("aria-describedby", "avatar-entry-safeguard");
  expect(regionalRequests).toEqual(new Set(["/regions/west-africa.webp"]));
  expect(Date.now() - startedAt).toBeLessThan(10_000);
  await expect(page.getByRole("button", { name: /Choose Amara.*selected/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Continue without a photo" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toContainText("However long the night");
  await expect(page.getByText("Question 1 of 12").last()).toBeVisible();
  expect(Date.now() - startedAt).toBeLessThan(10_000);
  expect(regionalRequests).toEqual(new Set(["/regions/west-africa.webp"]));
});

test("all five direct editions and four social webviews reach the compact choice", async ({ browser, request }) => {
  const editions = [
    ["west", "West Africa"],
    ["east", "East Africa"],
    ["central", "Central Africa"],
    ["north", "North Africa"],
    ["south", "Southern Africa"],
  ] as const;
  for (const [edition, regionName] of editions) {
    const response = await request.get(`/?edition=${edition}&source=direct`);
    const html = await response.text();
    expect(html).toContain("data-fast-avatar");
    expect(html).toContain(regionName);
    expect(html).not.toContain("AFRICAN REGION");
  }

  const profiles = [
    ["WhatsApp", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/116 Mobile Safari/537.36 WhatsApp", "whatsapp", "west"],
    ["Facebook", "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Mobile Safari/537.36 [FBAN/EMA]", "facebook", "east"],
    ["Instagram", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile Instagram", "instagram", "central"],
    ["TikTok", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile TikTok", "tiktok", "south"],
  ] as const;
  for (const [label, userAgent, source, edition] of profiles) {
    const context = await browser.newContext({ userAgent, viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    const externalRequests: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "127.0.0.1") externalRequests.push(request.url());
    });
    await page.goto(`/?edition=${edition}&source=${source}`);
    await expect(page.locator("[data-fast-avatar]"), label).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue without a photo" }), label).toBeVisible();
    expect(pageErrors, label).toEqual([]);
    expect(externalRequests, label).toEqual([]);
    await context.close();
  }
});

test("generic selection preserves safe context, supports back and survives refresh", async ({ page }) => {
  await page.goto("/?source=facebook&utm_medium=social&utm_campaign=roots_2026&ref=Auntie-7&nominated=1");
  await page.getByRole("button", { name: "West Africa" }).click();
  await expect(page.locator("[data-fast-avatar]")).toBeVisible();
  const url = new URL(page.url());
  expect(url.searchParams.get("edition")).toBe("west");
  expect(url.searchParams.get("source")).toBe("facebook");
  expect(url.searchParams.get("utm_campaign")).toBe("roots_2026");
  expect(url.searchParams.get("ref")).toBe("Auntie-7");
  expect(url.searchParams.get("nominated")).toBe("1");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/CHOOSE YOUR\s*AFRICAN REGION/);

  await page.goto(directWest);
  await expect(page.locator("[data-fast-avatar]")).toBeVisible();
  await page.reload();
  await expect(page.locator("[data-fast-avatar]")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).not.toContainText("AFRICAN REGION");
});

test("trusted review challenge needs one accept action and raw challenge claims are never trusted", async ({ page, request }) => {
  const response = await request.get("/?fixture=trusted-west&source=whatsapp");
  const html = await response.text();
  expect(html).toContain("data-trusted-challenge");
  expect(html).toContain("Ayo");
  expect(html).toContain("10");

  await page.goto("/?fixture=trusted-west&source=whatsapp");
  await expect(page.locator("[data-trusted-challenge]")).toBeVisible();
  await expect(page.getByText("Ayo scored")).toBeVisible();
  await expect(page.getByText("10/12")).toBeVisible();
  await expect(page.locator("#trusted-challenge-safeguard")).toHaveText("A playful culture score, never a measure of human worth.");
  await expect(page.getByRole("button", { name: "Accept the challenge" })).toHaveAttribute("aria-describedby", "trusted-challenge-safeguard");
  expect(await page.evaluate(() => localStorage.getItem("wybp-active-quiz-v1"))).toBeNull();
  await page.getByRole("button", { name: "Accept the challenge" }).click();
  await expect(page.locator("[data-fast-avatar]")).toBeVisible();

  await page.goto("/?edition=west&challenge=Unverified_2026&inviter=Malice&score=12&source=whatsapp");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/CHOOSE YOUR\s*AFRICAN REGION/);
  await expect(page.getByRole("status")).toContainText("could not be verified");
  await expect(page.locator("body")).not.toContainText("Malice");
  await expect(page.locator("body")).not.toContainText("12/12");
});

test("safeguard visual fixtures require the authorised review build", async ({ page, request }) => {
  for (const [fixture, expected] of [
    ["safeguard-question", "How scoring works"],
    ["safeguard-low-result", "Roots Rookie"],
    ["safeguard-high-result", "Bride Price Royalty"],
    ["safeguard-reduced-result", "Bride Price Royalty"],
  ] as const) {
    const response = await request.get(`/?safeguard_fixture=${fixture}`);
    expect(await response.text()).toContain(expected);
  }
  await page.goto("/?safeguard_fixture=safeguard-reduced-result");
  await expect(page.locator("main.review-reduced-motion")).toBeVisible();
  await expect(page.locator(".result-card-safeguard")).toHaveText("A playful culture score, never a measure of human worth.");
  await expect(page.locator(".confetti")).toBeHidden();
});

test("invalid and hostile query context fails to the generic selector without reflection", async ({ page }) => {
  const hostile = encodeURIComponent("javascript:alert(1)");
  await page.goto(`/?edition=moon&challenge=${hostile}&ref=${encodeURIComponent("//evil.example")}&source=hostile`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/CHOOSE YOUR\s*AFRICAN REGION/);
  await expect(page.getByRole("status").first()).toContainText("safely ignored");
  await expect(page.locator("#generic-entry-safeguard")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("javascript:alert(1)");
  await expect(page.locator("[data-fast-entry-shell]")).toHaveAttribute("data-entry-source", "unknown");
});

test("avatar choices are compact, keyboard-operable, stable and non-colour selected", async ({ page }) => {
  await page.goto(directWest);
  await expect(page.locator(".compact-avatar-grid button")).toHaveCount(6);
  const zuri = page.getByRole("button", { name: /Choose Zuri/ });
  await zuri.focus();
  await zuri.press("Enter");
  await expect(zuri).toHaveAttribute("aria-pressed", "true");
  await expect(zuri).toContainText("✓");
  await page.getByRole("button", { name: "See all 12 avatars" }).click();
  await expect(page.locator(".compact-avatar-grid button")).toHaveCount(12);
});

test("name begins after entry, remains editable and is never persisted", async ({ page }) => {
  await page.goto(directWest);
  await expect(page.getByLabel(/Display name/)).toHaveCount(0);
  await page.getByRole("button", { name: "Continue without a photo" }).click();
  const name = page.getByLabel(/Display name/);
  await name.fill("Adaeze");
  await page.getByRole("button", { name: /dawn/i }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("wybp-active-quiz-v1"))).not.toBeNull();
  const storageDump = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  expect(storageDump).not.toContain("Adaeze");
  expect(new URL(page.url()).search).not.toContain("Adaeze");
  await name.fill("Ada");
  await expect(page.locator(".quiz-player")).toContainText("Ada");
});

test("private photo picker is explicit, removable and produces no external request", async ({ page }) => {
  const externalRequests: string[] = [];
  await page.addInitScript(() => {
    (window as Window & { __revokedPhotoUrls?: string[] }).__revokedPhotoUrls = [];
    const original = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => {
      (window as Window & { __revokedPhotoUrls?: string[] }).__revokedPhotoUrls!.push(url);
      original(url);
    };
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "127.0.0.1") externalRequests.push(request.url());
  });
  await page.goto(directWest);
  const cancelledChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a private photo/ }).click();
  const cancelledChooser = await cancelledChooserPromise;
  await cancelledChooser.setFiles([]);
  await expect(page.getByRole("button", { name: "Continue without a photo" })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a private photo/ }).click();
  const fileChooser = await chooser;
  await fileChooser.setFiles({
    name: "private.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.getByRole("status")).toContainText("not uploaded or saved");
  await expect(page.locator(".compact-avatar-hero img")).toHaveAttribute("src", /^blob:/);
  await page.getByRole("button", { name: "Start Question 1" }).click();
  await page.getByRole("button", { name: /dawn/i }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("wybp-active-quiz-v1"))).not.toBeNull();
  const recovery = await page.evaluate(() => localStorage.getItem("wybp-active-quiz-v1") || "");
  expect(recovery).not.toContain("blob:");
  expect(recovery).not.toContain("private.png");
  expect(recovery).not.toMatch(/photo|filename/i);
  await page.getByRole("button", { name: /Change avatar/ }).click();
  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.locator(".compact-avatar-hero img")).toHaveAttribute("src", "/avatars/amara.webp");
  expect(await page.evaluate(() => (window as Window & { __revokedPhotoUrls?: string[] }).__revokedPhotoUrls?.length)).toBeGreaterThan(0);
  expect(externalRequests).toEqual([]);
});

test("quiz refresh recovery is versioned, tab-scoped and Start again clears it", async ({ page }) => {
  await page.goto(directWest);
  await page.getByRole("button", { name: "Continue without a photo" }).click();
  await page.getByRole("button", { name: /dawn/i }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("wybp-active-quiz-v1") || "null")?.questionPosition)).toBe(1);
  await page.reload();
  await expect(page.getByRole("heading", { level: 2 })).toContainText("àṣẹ");
  await expect(page.getByRole("status").filter({ hasText: "restored after refresh" })).toBeVisible();
  await page.getByRole("button", { name: "Start again" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/CHOOSE YOUR\s*AFRICAN REGION/);
  expect(await page.evaluate(() => ({ local: localStorage.getItem("wybp-active-quiz-v1"), session: sessionStorage.getItem("wybp-active-quiz-instance-v1") }))).toEqual({ local: null, session: null });
});

test("blocked and corrupt storage never prevents play", async ({ browser, page }) => {
  const blocked = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await blocked.addInitScript(() => {
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      Object.defineProperty(Storage.prototype, method, { configurable: true, value() { throw new DOMException("Blocked", "SecurityError"); } });
    }
  });
  const blockedPage = await blocked.newPage();
  await blockedPage.goto(directWest);
  await blockedPage.getByRole("button", { name: "Continue without a photo" }).click();
  await expect(blockedPage.getByRole("heading", { level: 2 })).toContainText("However long the night");
  await blocked.close();

  await page.goto(directWest);
  await page.evaluate(() => {
    localStorage.setItem("wybp-active-quiz-v1", "{bad");
    sessionStorage.setItem("wybp-active-quiz-instance-v1", "bad-instance-123456");
  });
  await page.reload();
  await expect(page.locator("[data-fast-avatar]")).toBeVisible();
});

test("question focus, exact progress, duplicate-start guard and local hooks work", async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { __wybpEntryEvents?: Array<{ name: string }> }).__wybpEntryEvents = [];
    window.addEventListener("wybp:entry-event", (event) => {
      (window as Window & { __wybpEntryEvents?: Array<{ name: string }> }).__wybpEntryEvents?.push((event as CustomEvent<{ name: string }>).detail);
    });
  });
  await page.goto(directWest);
  await page.getByRole("button", { name: /Choose Zuri/ }).click();
  await page.getByRole("button", { name: "Continue without a photo" }).dblclick();
  await expect(page.getByText("Question 1 of 12").last()).toBeVisible();
  await expect(page.getByText("How scoring works")).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.textContent)).toContain("However long the night");
  const names = await page.evaluate(() => (window as Window & { __wybpEntryEvents?: Array<{ name: string }> }).__wybpEntryEvents?.map((event) => event.name));
  expect(names).toEqual(expect.arrayContaining(["entry_view", "entry_shell_visible", "entry_interactive", "avatar_selected", "photo_skipped", "quiz_started"]));
  expect(names?.filter((name) => name === "quiz_started")).toHaveLength(1);
});

test("question media failure remains playable through answer text", async ({ page }) => {
  await page.route("**/quiz-art/west-*.webp", (route) => route.abort());
  await page.goto(directWest);
  await page.getByRole("button", { name: "Continue without a photo" }).click();
  await page.getByRole("button", { name: /dawn/i }).click();
  await page.getByRole("button", { name: /Next challenge/ }).click();
  await page.getByRole("button", { name: /the power to make things happen/i }).click();
  await page.getByRole("button", { name: /Next challenge/ }).click();
  for (const answer of ["Ghana", "Mali", "Songhai"]) await page.getByRole("button", { name: new RegExp(answer) }).click();
  await page.getByRole("button", { name: /Lock in 3\/3/ }).click();
  await page.getByRole("button", { name: /Next challenge/ }).click();
  await expect(page.getByRole("heading", { level: 2 })).toContainText("jollof rice");
  await expect(page.locator(".question-image-fallback")).toHaveCount(4);
  await expect(page.getByRole("button", { name: /Jollof rice/ })).toBeEnabled();
});

test("only the first two question asset slots are considered after edition selection", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("link[data-wybp-question-prefetch]")).toHaveCount(0);
  await page.getByRole("button", { name: "West Africa" }).click();
  await expect(page.locator("link[data-wybp-question-prefetch]")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue without a photo" }).click();
  await expect(page.locator("link[data-wybp-question-prefetch]")).toHaveCount(0);
});

test("sound starts only after gesture and the existing mute control remains intact", async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { __wybpAudioContexts?: number }).__wybpAudioContexts = 0;
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: function AudioContextProbe() { (window as Window & { __wybpAudioContexts?: number }).__wybpAudioContexts! += 1; },
    });
  });
  await page.goto(directWest);
  expect(await page.evaluate(() => (window as Window & { __wybpAudioContexts?: number }).__wybpAudioContexts)).toBe(0);
  await expect(page.getByRole("button", { name: "Turn sound off" })).toContainText("Sound on");
  await page.getByRole("button", { name: "Turn sound off" }).click();
  await expect(page.getByRole("button", { name: "Turn sound on" })).toContainText("Sound off");
});

test("320px and reduced-motion modes remain accessible without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(directWest);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  const primary = page.getByRole("button", { name: "Continue without a photo" });
  const box = await primary.boundingBox();
  expect(box?.height || 0).toBeGreaterThanOrEqual(44);
  const animation = await page.locator(".fast-avatar-stage").evaluate((element) => getComputedStyle(element).animationName);
  expect(animation).toBe("none");
  await primary.click();
  await expect(page.getByText("Question 1 of 12").last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("mid-range mobile timing keeps every meaningful entry point under ten seconds", async ({ browser }) => {
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
  const readTiming = async (name: string) => {
    await expect.poll(() => page.evaluate((markName) => performance.getEntriesByName(markName).at(-1)?.startTime ?? null, name)).not.toBeNull();
    return page.evaluate((markName) => performance.getEntriesByName(markName).at(-1)?.startTime ?? Infinity, name);
  };

  await page.goto("/?source=direct");
  await expect(page.getByRole("button", { name: "West Africa" })).toBeVisible();
  const genericChoiceReadyMs = await readTiming("wybp:entry_interactive");

  await page.goto(directWest);
  await expect(page.locator("[data-fast-avatar]")).toBeVisible();
  const avatarReadyMs = await readTiming("wybp:entry_shell_visible");
  await expect(page.getByText(/About 3 minutes/i).last()).toBeVisible();
  await page.getByRole("button", { name: "Continue without a photo" }).click();
  await expect(page.getByText("Question 1 of 12").last()).toBeVisible();
  const questionOneReadyMs = await readTiming("wybp:quiz_started");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  expect(genericChoiceReadyMs).toBeLessThan(10_000);
  expect(avatarReadyMs).toBeLessThan(10_000);
  expect(questionOneReadyMs).toBeLessThan(10_000);
  expect(overflow).toBeLessThanOrEqual(1);
  console.log("PROMPT5_PERFORMANCE_EVIDENCE", JSON.stringify({
    genericChoiceReadyMs,
    avatarReadyMs,
    questionOneReadyMs,
    overflow,
    conditions: "Pixel 6a-class Android emulation, 360x800 CSS pixels, 2x DPR, touch enabled, 4x CPU slowdown, local preview, warm application cache, no network throttling",
  }));
  await context.close();
});

test("ordinary runtime requests stay first-party and no service worker is registered", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
  });
  await page.goto(directWest);
  await page.getByRole("button", { name: "Continue without a photo" }).click();
  expect(externalRequests).toEqual([]);
  expect(await page.evaluate(async () => "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0)).toBe(0);
});

test("ordinary production diagnostics remain unavailable by query string", async ({ page }) => {
  await page.goto(`${directWest}&diagnostics=1`);
  await expect(page.locator("[data-fast-avatar]")).toBeVisible();
  await expect(page.locator("[data-entry-diagnostics]")).toHaveCount(0);
});
