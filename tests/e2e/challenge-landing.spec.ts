import { expect, test, type Page } from "@playwright/test";
import { regions } from "../../app/gameData";

const codes = Object.freeze({
  valid: "1".repeat(48),
  expired: "2".repeat(48),
  revoked: "3".repeat(48),
  removed: "4".repeat(48),
  temporary: "5".repeat(48),
  unicode: "6".repeat(48),
  missing: "9".repeat(48),
});
const validPath = `/challenge/${codes.valid}`;

declare global {
  interface Window {
    __wybpChallengeEvents?: Array<Record<string, unknown>>;
    __wybpAudioContexts?: number;
  }
}

async function installChallengeEventRecorder(page: Page) {
  await page.addInitScript(() => {
    window.__wybpChallengeEvents = [];
    window.addEventListener("wybp:challenge-event", (event) => {
      window.__wybpChallengeEvents?.push({ ...(event as CustomEvent).detail });
    });
  });
}

async function completeChallengeQuiz(page: Page, correctCount: number) {
  await page.goto(validPath);
  await page.getByRole("button", { name: "Accept challenge" }).click();
  await page.getByRole("button", { name: "Continue without a photo" }).click();
  for (const [questionIndex, question] of regions.west.questions.entries()) {
    const buttons = page.locator(".answer-grid > button");
    let choice = question.correct;
    if (questionIndex >= correctCount) {
      if (question.kind === "multi") {
        choice = [0, 1, 2];
        if ([...choice].sort().join() === [...question.correct].sort().join()) choice = [0, 1, 3];
      } else {
        choice = [(question.correct[0] + 1) % question.options.length];
      }
    }
    for (const option of choice) await buttons.nth(option).click();
    if (question.kind === "multi") await page.getByRole("button", { name: /Lock in 3\/3 answers/ }).click();
    await page.locator(".answer-reveal").getByRole("button", { name: questionIndex === 11 ? /Reveal my result/ : /Next challenge/ }).click({ force: true });
    if (questionIndex < 11 && (questionIndex + 1) % 3 === 0) {
      await page.getByRole("button", { name: /Claim gem/ }).click();
    }
  }
  await expect(page.locator(".result-stage")).toBeVisible();
  await expect(page.locator(".challenge-comparison")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.afterAll(async ({ request }) => {
  await request.post("/__preview__/shutdown");
});

test("active challenge is personalised in raw HTML, accessible and starts the right edition with one tap", async ({ page, request }) => {
  const response = await request.get(validPath);
  const html = await response.text();
  expect(html).toContain("<strong>Nia</strong> has challenged you");
  expect(html).toContain("West Africa<!-- --> Edition");
  expect(html).toContain("Score to beat: <strong>10<!-- -->/<!-- -->12</strong>");
  expect(html).toContain('/avatars/adjoa-v2.webp');
  expect(html).toContain('/regions/west-africa.webp');

  await installChallengeEventRecorder(page);
  let acceptancePosts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/accept")) acceptancePosts += 1;
  });
  await page.goto(validPath);
  expect(acceptancePosts).toBe(0);
  await expect(page.locator("[data-challenge-active]")).toBeVisible();
  await expect(page.getByText("Nia has challenged you")).toBeVisible();
  await expect(page.getByText("Score to beat:")).toContainText("10/12");
  await expect(page.getByText("A playful culture score, never a measure of human worth.")).toBeVisible();
  const accept = page.getByRole("button", { name: "Accept challenge" });
  const acceptBox = await accept.boundingBox();
  expect(acceptBox?.height || 0).toBeGreaterThanOrEqual(44);
  await accept.focus();
  await expect(accept).toBeFocused();
  await accept.press("Enter");
  await expect(page.locator("[data-fast-avatar]")).toBeVisible();
  await expect(page.getByText("West Africa").first()).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(validPath);
  expect(acceptancePosts).toBe(1);
  await page.getByRole("button", { name: "Continue without a photo" }).click();
  await expect(page.getByText("Question 1 of 12").last()).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toContainText("However long the night");

  const recovery = await page.evaluate(() => JSON.parse(localStorage.getItem("wybp-active-quiz-v1") || "null"));
  expect(recovery).toMatchObject({
    edition: "west",
    trustedChallengeCode: codes.valid,
    attribution: { nominated: true },
  });
  expect(recovery).not.toHaveProperty("score");
  expect(recovery).not.toHaveProperty("inviterScore");
  expect(JSON.stringify(recovery)).not.toMatch(/Nia|photo|token|session|idempotency/i);
  const events = await page.evaluate(() => window.__wybpChallengeEvents || []);
  expect(events.map((event) => event.name)).toEqual(["challenge_view", "challenge_accept"]);
  expect(JSON.stringify(events)).not.toMatch(/Nia|score|url|referrer|session|token|user-agent/i);
});

test("repeated taps are idempotent, refresh resumes and Back restores the landing", async ({ page, browser }) => {
  let acceptancePosts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/accept")) acceptancePosts += 1;
  });
  await page.goto(validPath);
  await page.getByRole("button", { name: "Accept challenge" }).dblclick();
  await expect(page.locator("[data-fast-avatar]")).toBeVisible();
  expect(acceptancePosts).toBe(1);
  await page.reload();
  await expect(page.locator("[data-fast-avatar]")).toBeVisible();
  expect(acceptancePosts).toBe(1);

  const backContext = await browser.newContext();
  const backPage = await backContext.newPage();
  await backPage.goto(validPath);
  await backPage.getByRole("button", { name: "Accept challenge" }).click();
  await expect(backPage.locator("[data-fast-avatar]")).toBeVisible();
  await backPage.goBack();
  await expect(backPage.locator("[data-challenge-active]")).toBeVisible();
  await backContext.close();
});

test("expired, revoked, missing, removed and malformed links reveal one neutral presentation", async ({ page }) => {
  for (const value of [codes.expired, codes.revoked, codes.missing, codes.removed, "not-a-valid-code", "A".repeat(48)]) {
    await page.goto(`/challenge/${value}`);
    await expect(page.locator("[data-challenge-unavailable]")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This challenge is no longer available.");
    await expect(page.getByRole("link", { name: "Choose a normal regional quiz" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Mirembe|Amara|Safiya|Score to beat/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  }
});

test("temporary and offline acceptance failures are retryable without a generic detour", async ({ page }) => {
  await page.goto(`/challenge/${codes.temporary}`);
  await expect(page.locator("[data-challenge-temporary]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry challenge" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Choose a normal regional quiz" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/D1|SQL|database|stack|Thandi|11\/12/i);

  await page.route(`**${validPath}/accept`, (route) => route.abort("internetdisconnected"));
  await page.goto(validPath);
  await page.getByRole("button", { name: "Accept challenge" }).click();
  await expect(page.getByRole("status")).toContainText("connection paused");
  await expect(page.getByRole("button", { name: "Retry acceptance" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Choose a normal quiz instead" })).toBeVisible();
  await page.unroute(`**${validPath}/accept`);
  await page.getByRole("button", { name: "Retry acceptance" }).click();
  await expect(page.locator("[data-fast-avatar]")).toBeVisible();
});

test("direct completed recovery without an accepted server attempt does not invent comparison results", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(({ code, answers }) => {
    const instanceId = "completed-instance-0001";
    sessionStorage.setItem("wybp-active-quiz-instance-v1", instanceId);
    localStorage.setItem("wybp-active-quiz-v1", JSON.stringify({
      version: 1,
      instanceId,
      edition: "west",
      avatarId: "amara",
      questionPosition: 12,
      answerChoices: answers,
      updatedAt: Date.now(),
      attribution: { source: "direct", nominated: true },
      trustedChallengeCode: code,
    }));
  }, { code: codes.valid, answers: regions.west.questions.map((question) => question.correct) });
  const page = await context.newPage();
  await page.goto(validPath);
  await expect(page.locator(".result-stage")).toBeVisible();
  await expect(page.locator(".comparison-failure")).toBeVisible();
  await expect(page.locator("body")).toContainText("could not confirm the head-to-head comparison");
  await expect(page.locator("body")).not.toContainText(/beat Nia|tied Nia|family rank|winner/i);
  const storage = await page.evaluate(() => localStorage.getItem("wybp-active-quiz-v1") || "");
  expect(storage).not.toMatch(/Nia|score|photo|token|sessionId/i);
  await context.close();
});

test("beat, tie and loss show authoritative, encouraging and accessible comparisons", async ({ browser }) => {
  test.setTimeout(120_000);
  for (const scenario of [
    { score: 11, outcome: "beat", title: "Challenge won", difference: "1 point ahead" },
    { score: 10, outcome: "tied", title: "Perfect tie", difference: "Scores level" },
    { score: 8, outcome: "did_not_beat", title: "Knowledge celebrated", difference: "2 points apart" },
  ]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installChallengeEventRecorder(page);
    await completeChallengeQuiz(page, scenario.score);
    const comparison = page.locator(".challenge-comparison");
    await expect(comparison).toHaveAttribute("data-comparison-outcome", scenario.outcome);
    await expect(comparison.getByRole("heading", { level: 3 })).toHaveText(scenario.title);
    await expect(comparison).toContainText(`Nia${10}Inviter score`);
    await expect(comparison).toContainText(`You${scenario.score}Your score`);
    await expect(comparison).toContainText(scenario.difference);
    await expect(comparison).toContainText("A playful culture score, never a measure of human worth.");
    await expect(page.getByRole("button", { name: /Challenge three more people/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Play another region" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    const events = await page.evaluate(() => window.__wybpChallengeEvents || []);
    expect(events.filter((event) => event.name === "challenge_complete")).toHaveLength(1);
    expect(events.filter((event) => event.name === "comparison_view")).toHaveLength(1);
    expect(events.filter((event) => event.name === "comparison_outcome")).toHaveLength(1);
    expect(events.find((event) => event.name === "comparison_outcome")?.outcome).toBe(scenario.outcome);
    expect(JSON.stringify(events)).not.toMatch(/Nia|score|code|url|session|token|photo|user-agent/i);
    await context.close();
  }
});

test("comparison actions rechallenge through the generic fallback and return to region selection", async ({ page }) => {
  await page.addInitScript(() => {
    window.__wybpChallengeEvents = [];
    window.addEventListener("wybp:challenge-event", (event) => window.__wybpChallengeEvents?.push({ ...(event as CustomEvent).detail }));
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => undefined });
  });
  await completeChallengeQuiz(page, 11);
  const primary = page.getByRole("button", { name: /Challenge three more people/ });
  await primary.focus();
  await expect(primary).toBeFocused();
  const box = await primary.boundingBox();
  expect(box?.height || 0).toBeGreaterThanOrEqual(44);
  await primary.press("Enter");
  await expect.poll(() => page.evaluate(() => (window.__wybpChallengeEvents || []).filter((event) => event.name === "rechallenge_start").length)).toBe(1);
  await primary.click();
  await expect.poll(() => page.evaluate(() => (window.__wybpChallengeEvents || []).filter((event) => event.name === "rechallenge_start").length)).toBe(1);
  await page.getByRole("button", { name: "Play another region" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/CHOOSE YOUR\s*AFRICAN REGION/);
});

test("320px, Android and iPhone in-app-browser layouts keep regional identity and actions usable", async ({ browser }) => {
  const profiles = [
    { label: "320px", viewport: { width: 320, height: 568 }, userAgent: "Mozilla/5.0 Mobile" },
    { label: "Android", viewport: { width: 360, height: 800 }, userAgent: "Mozilla/5.0 (Linux; Android 13) WhatsApp" },
    { label: "iPhone", viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Instagram" },
  ];
  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      userAgent: profile.userAgent,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(validPath);
    await expect(page.locator("[data-challenge-active]"), profile.label).toBeVisible();
    await expect(page.locator(".challenge-route-art img"), profile.label).toBeVisible();
    await expect(page.getByText("Nia has challenged you"), profile.label).toBeVisible();
    await expect(page.getByText("Score to beat:"), profile.label).toBeVisible();
    await expect(page.getByText("A playful culture score, never a measure of human worth."), profile.label).toBeVisible();
    const accept = page.getByRole("button", { name: "Accept challenge" });
    await expect(accept, profile.label).toBeVisible();
    const box = await accept.boundingBox();
    expect(box?.height || 0, profile.label).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), profile.label).toBeLessThanOrEqual(1);
    const animationDuration = await page.locator(".challenge-route-shell").evaluate((element) => getComputedStyle(element).animationDuration);
    expect(["0s", "0.001s"], profile.label).toContain(animationDuration);
    await context.close();
  }
});

test("challenge view emits once after hydration and starts no sound before the user gesture", async ({ page }) => {
  await page.addInitScript(() => {
    window.__wybpChallengeEvents = [];
    window.addEventListener("wybp:challenge-event", (event) => window.__wybpChallengeEvents?.push({ ...(event as CustomEvent).detail }));
    window.__wybpAudioContexts = 0;
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: function AudioContextProbe() { window.__wybpAudioContexts! += 1; },
    });
  });
  await page.goto(validPath);
  await expect.poll(() => page.evaluate(() => window.__wybpChallengeEvents?.length || 0)).toBe(1);
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__wybpChallengeEvents?.length || 0)).toBe(1);
  expect(await page.evaluate(() => window.__wybpChallengeEvents?.[0]?.name)).toBe("challenge_view");
  expect(await page.evaluate(() => window.__wybpAudioContexts)).toBe(0);
});
