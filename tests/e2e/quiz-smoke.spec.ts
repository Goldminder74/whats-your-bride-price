import { expect, test, type Page } from "@playwright/test";
import { regions, type RegionKey } from "../../app/gameData";

declare global {
  interface Window {
    __wybpShares?: Array<{
      title?: string;
      text?: string;
      url?: string;
      fileCount: number;
    }>;
  }
}

const regionKeys: RegionKey[] = ["west", "east", "central", "north", "south"];

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.afterAll(async ({ request }) => {
  await request.post("/__preview__/shutdown");
});

async function installShareRecorder(page: Page) {
  await page.addInitScript(() => {
    window.__wybpShares = [];
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        window.__wybpShares?.push({
          title: data.title,
          text: data.text,
          url: data.url,
          fileCount: data.files?.length || 0,
        });
      },
    });
  });
}

async function waitForGameHydration(page: Page) {
  await expect(page.locator("main[data-hydrated='true']")).toBeVisible();
}

async function completePerfectWestQuiz(page: Page) {
  await page.goto("/?edition=west");
  await page.getByRole("button", { name: /Enter Region 01/ }).click();

  for (const [questionIndex, question] of regions.west.questions.entries()) {
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      String(questionIndex + 1),
    );
    const answerButtons = page.locator(".answer-grid > button");
    for (const correctIndex of question.correct) await answerButtons.nth(correctIndex).click();
    if (question.kind === "multi") {
      await page.getByRole("button", { name: /Lock in 3\/3 answers/ }).click();
    }

    await expect(page.locator(".answer-reveal")).toContainText("CORRECT");
    await page
      .locator(".answer-reveal")
      .getByRole("button", { name: questionIndex === 11 ? /Reveal my result/ : /Next challenge/ })
      .click();

    if (questionIndex === 11) {
      await expect(page.locator(".score-reveal-stage")).toBeVisible();
      await expect(page.locator(".reveal-safeguard")).toHaveText("A playful culture score, never a measure of human worth.");
      await expect(page.locator(".drum-roll-meter i")).toHaveCount(13);
    }

    if (questionIndex < 11 && (questionIndex + 1) % 3 === 0) {
      await expect(page.getByRole("dialog", { name: "Culture drop" })).toBeVisible();
      await page.getByRole("button", { name: /Claim gem/ }).click();
    }
  }

  await expect(page.locator(".result-stage")).toBeVisible();
}

test("homepage loads the complete regional entry surface", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("DO YOU KNOW YOUR ROOTS?");
  await expect(page.locator(".region-card")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Turn sound off" })).toContainText("Sound on");
  await expect(page.locator("#home-entry-safeguard")).toHaveText("A playful culture score, never a measure of human worth.");
  await expect(page.getByRole("button", { name: /Start the challenge/ })).toHaveAttribute("aria-describedby", "home-entry-safeguard");
});

test("published image answers use neutral visible markers and descriptive keyboard controls", async ({ page }) => {
  await page.goto("/?edition=west");
  await page.getByRole("button", { name: /Enter Region 01/ }).click();

  for (let questionIndex = 0; questionIndex < 3; questionIndex += 1) {
    const question = regions.west.questions[questionIndex];
    const buttons = page.locator(".answer-grid > button");
    for (const correctIndex of question.correct) await buttons.nth(correctIndex).click();
    if (question.kind === "multi") await page.getByRole("button", { name: /Lock in 3\/3 answers/ }).click();
    await page.getByRole("button", { name: /Next challenge/ }).click();
  }

  const question = regions.west.questions[3];
  const answerGrid = page.locator(".answer-grid");
  const buttons = answerGrid.locator("> button");
  await expect(buttons).toHaveCount(4);
  for (const [optionIndex, canonicalAnswer] of question.options.entries()) {
    const button = buttons.nth(optionIndex);
    const image = button.locator("img");
    await expect(button.locator(".answer-letter")).toHaveText(String.fromCharCode(65 + optionIndex));
    await expect(button).not.toContainText(canonicalAnswer);
    await expect(button).not.toHaveAttribute("title");
    const alternativeText = await image.getAttribute("alt");
    expect(alternativeText?.length).toBeGreaterThanOrEqual(24);
    expect(alternativeText?.toLocaleLowerCase("en")).not.toContain(canonicalAnswer.toLocaleLowerCase("en"));
  }
  await buttons.first().focus();
  await expect(buttons.first()).toBeFocused();
  const judgement = page.waitForResponse((response) => new URL(response.url()).pathname === "/questions/image-answer");
  await page.keyboard.press("Enter");
  expect((await judgement).status()).toBe(200);
  await expect(page.locator(".answer-reveal")).toContainText("CORRECT");

  const deliveredJavaScript = await page.evaluate(async () => {
    const urls = [...new Set(performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => new URL(url).pathname.endsWith(".js")))];
    return (await Promise.all(urls.map(async (url) => (await fetch(url)).text()))).join("\n");
  });
  for (const unnecessaryImageLabel of ["Ankh", "Beaded collar", "Painted house", "Jebena and cups", "Calabash bowl", "Raffia cloth", "Ndebele beadwork", "Talking drum"]) {
    expect(deliveredJavaScript).not.toContain(unnecessaryImageLabel);
  }
  for (const { question } of regionKeys.flatMap((region) => regions[region].questions.map((item) => ({ question: item }))).filter(({ question }) => question.kind === "image")) {
    expect(deliveredJavaScript).not.toContain(question.explanation);
  }
});

test("About explains scoring, privacy, cultural review and intended audience", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "About the game" }).click();
  const about = page.getByRole("dialog", { name: "About this game" });
  await expect(about).toContainText("A playful culture score, never a measure of human worth.");
  await expect(about).toContainText("How scoring works");
  await expect(about).toContainText("does not assess suitability for marriage or relationships");
  await expect(about).toContainText("The original is never uploaded");
  await expect(about).toContainText("source metadata is not copied");
  await expect(about).toContainText("public deletion controls are not active");
  await expect(about).toContainText("Cultural review and reporting");
  await expect(about).toContainText("not directed to children under 13");
});

test("browser and install icon paths resolve with the declared MIME types", async ({ page, request }) => {
  await page.goto("/");
  const iconLinks = await page.locator('link[rel*="icon"]').evaluateAll((links) =>
    links.map((link) => ({
      href: link.getAttribute("href"),
      type: link.getAttribute("type"),
    })),
  );
  expect(iconLinks).toEqual(expect.arrayContaining([
    expect.objectContaining({ href: "/favicon.ico", type: "image/x-icon" }),
    expect.objectContaining({ href: "/favicon.svg", type: "image/svg+xml" }),
    expect.objectContaining({ href: "/apple-touch-icon.png", type: "image/png" }),
  ]));

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await manifestResponse.json();
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok(), `${icon.src} should resolve`).toBe(true);
    expect(response.headers()["content-type"]).toContain(icon.type);
  }

  for (const icon of iconLinks) {
    if (!icon.href || !icon.type) continue;
    const response = await request.get(icon.href);
    expect(response.ok(), `${icon.href} should resolve`).toBe(true);
    expect(response.headers()["content-type"]).toContain(icon.type);
  }
});

test("every existing regional edition can be started", async ({ page }) => {
  for (const regionKey of regionKeys) {
    await page.goto("/");
    await waitForGameHydration(page);
    await page.locator(`.region-card[data-region="${regionKey}"]`).click();
    await expect(page.locator(".setup-copy h1")).toContainText(regions[regionKey].name);
    await expect(page).toHaveURL(new RegExp(`edition=${regionKey}`));
  }
});

test("avatar selection is reflected in the player portrait", async ({ page }) => {
  await page.goto("/?edition=east");
  const avatar = page.getByRole("button", { name: /Choose Zuri,/ });
  await avatar.click();
  await expect(avatar).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".avatar-hero img")).toHaveAttribute("src", /zuri\.webp$/);
});

test("a selected photo stays in the browser and causes no application upload", async ({ page }) => {
  const writeRequests: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      writeRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.goto("/?edition=central");
  await page.locator('input[type="file"]').setInputFiles({
    name: "private-player.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });

  await expect(page.locator(".avatar-hero img")).toHaveAttribute("src", /^blob:/);
  expect(writeRequests).toEqual([]);
});

test("a perfect quiz preserves scoring, result, download, sharing and nomination", async ({ page }) => {
  await installShareRecorder(page);
  await completePerfectWestQuiz(page);

  await expect(page.locator(".result-copy .eyebrow")).toHaveText("Your score: 12/12");
  await expect(page.locator(".result-card h1")).toHaveText("Bride Price Royalty");
  await expect(page.locator(".result-card small")).toContainText("Knowledge score 12/12");
  await expect(page.locator(".result-card-safeguard")).toHaveText("A playful culture score, never a measure of human worth.");
  await expect(page.locator(".confetti i")).toHaveCount(58);
  await expect(page.locator(".celebration-halo")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("bride-price-west-story.png");
  expect(await download.path()).toBeTruthy();

  await page.getByRole("button", { name: "Open Share Centre" }).click();
  await expect(page.locator("[data-share-centre]")).toHaveAttribute("data-media-ready", "true");
  await page.locator("[data-share-centre]").getByRole("button", { name: /Native share/ }).click();
  await expect.poll(() => page.evaluate(() => window.__wybpShares?.length)).toBe(1);
  let shares = await page.evaluate(() => window.__wybpShares);
  expect(shares?.[0]).toMatchObject({
    title: "Play the culture challenge!",
    url: expect.stringContaining("?edition=west"),
    fileCount: 1,
  });
  expect(shares?.[0]?.text).toContain("A playful culture score, never a measure of human worth.");
  expect(shares?.[0]?.url).not.toContain("nominated=1");
  expect(new URL(shares?.[0]?.url || "").origin).toBe("http://127.0.0.1:3100");

  await page.getByRole("button", { name: "Close Share Centre" }).click();
  await page.getByRole("button", { name: /Nominate three people/ }).click();
  await expect(page.locator("[data-nominate-three]")).toBeVisible();
  await expect(page.locator("[data-nominate-three]")).toHaveAttribute("data-mode", "generic");
  await page.locator('[data-slot="1"]').getByRole("button", { name: "Share menu" }).click();
  await expect.poll(() => page.evaluate(() => window.__wybpShares?.length)).toBe(2);
  shares = await page.evaluate(() => window.__wybpShares);
  expect(shares?.[1]).toMatchObject({
    title: "You’ve been invited to play!",
    url: expect.stringContaining("?edition=west"),
  });
  expect(shares?.[1]?.url).not.toContain("/challenge/");
  expect(shares?.[1]?.url).not.toContain("nominated=1");
  expect(shares?.[1]?.text).toContain("A playful culture score, never a measure of human worth.");
  await expect(page.locator(".challenge-action-note")).toContainText("regional-invitation slots");
});

test("a direct west edition link opens setup", async ({ page }) => {
  await page.goto("/?edition=west");
  await expect(page.locator(".setup-stage")).toBeVisible();
  await expect(page.locator(".setup-copy h1")).toContainText("West Africa");
});

test("the homepage renders within a common mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Start the challenge/ })).toBeVisible();
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});
