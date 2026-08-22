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

    await expect(page.getByRole("status")).toContainText("CORRECT");
    await page
      .getByRole("status")
      .getByRole("button", { name: questionIndex === 11 ? /Reveal my result/ : /Next challenge/ })
      .click();

    if (questionIndex === 11) {
      await expect(page.locator(".score-reveal-stage")).toBeVisible();
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
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z5p8AAAAASUVORK5CYII=",
      "base64",
    ),
  });

  await expect(page.locator(".avatar-hero img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  expect(writeRequests).toEqual([]);
});

test("a perfect quiz preserves scoring, result, download, sharing and nomination", async ({ page }) => {
  await installShareRecorder(page);
  await completePerfectWestQuiz(page);

  await expect(page.locator(".result-copy .eyebrow")).toHaveText("Your score: 12/12");
  await expect(page.locator(".result-card h1")).toHaveText("Bride Price Royalty");
  await expect(page.locator(".result-card small")).toContainText("Knowledge score 12/12");
  await expect(page.locator(".confetti i")).toHaveCount(58);
  await expect(page.locator(".celebration-halo")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("bride-price-west-result.png");
  expect(await download.path()).toBeTruthy();

  await page.getByRole("button", { name: /Share my portrait/ }).click();
  await expect.poll(() => page.evaluate(() => window.__wybpShares?.length)).toBe(1);
  let shares = await page.evaluate(() => window.__wybpShares);
  expect(shares?.[0]).toMatchObject({
    title: "My Bride Price culture-game result",
    url: expect.stringContaining("?edition=west&nominated=1"),
    fileCount: 1,
  });
  expect(new URL(shares?.[0]?.url || "").origin).toBe("http://127.0.0.1:3100");

  await page.getByRole("button", { name: /Nominate a friend/ }).click();
  await expect.poll(() => page.evaluate(() => window.__wybpShares?.length)).toBe(2);
  shares = await page.evaluate(() => window.__wybpShares);
  expect(shares?.[1]).toMatchObject({
    title: "You’ve been nominated!",
    url: expect.stringContaining("?edition=west&nominated=1"),
  });

  const whatsappHref = await page.getByRole("link", { name: /Send nomination on WhatsApp/ }).getAttribute("href");
  expect(whatsappHref).toContain("https://wa.me/?text=");
  expect(decodeURIComponent(whatsappHref || "")).toContain("?edition=west&nominated=1");
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
