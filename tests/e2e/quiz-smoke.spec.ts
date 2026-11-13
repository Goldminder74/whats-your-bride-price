import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { regions, type RegionKey } from "../../app/gameData";

type LookupQuestion = { prompt: string; options: string[]; correct: number[]; kind: string };

function normalizePrompt(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const publishedWest = JSON.parse(readFileSync(new URL("../../data/question-bank/published/west.json", import.meta.url), "utf8")) as {
  questions: LookupQuestion[];
};
const westLookup = new Map<string, LookupQuestion>();
for (const question of [...regions.west.questions, ...publishedWest.questions]) {
  westLookup.set(normalizePrompt(question.prompt), question);
}

declare global {
  interface Window {
    __wybpShares?: Array<{
      title?: string;
      text?: string;
      url?: string;
      fileCount: number;
    }>;
    __wybpHomeSeen?: boolean;
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
  await page.getByRole("button", { name: /Find out your bride price/ }).click();
  const seenPrompts: string[] = [];

  for (let questionIndex = 0; questionIndex < 12; questionIndex += 1) {
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      String(questionIndex + 1),
    );
    await expect(page.locator(".answer-grid > button").first()).toBeVisible();
    const prompt = await page.locator(".question-wrap h2").innerText();
    seenPrompts.push(prompt);
    const question = westLookup.get(normalizePrompt(prompt));
    expect(question, prompt).toBeTruthy();
    const answerButtons = page.locator(".answer-grid > button");
    const labels: string[] = [];
    const count = await answerButtons.count();
    for (let index = 0; index < count; index += 1) {
      const label = answerButtons.nth(index).locator("b");
      labels.push((await label.count()) ? (await label.innerText()).trim() : "");
    }
    const imageRound = labels.every((label) => label.length === 0);
    if (imageRound) {
      for (const correctIndex of question!.correct) await answerButtons.nth(correctIndex).click();
    } else {
      for (const correctIndex of question!.correct) {
        const wanted = normalizePrompt(question!.options[correctIndex]);
        const buttonIndex = labels.findIndex((label) => normalizePrompt(label) === wanted);
        expect(buttonIndex, `${prompt} / ${question!.options[correctIndex]}`).toBeGreaterThanOrEqual(0);
        await answerButtons.nth(buttonIndex).click();
      }
    }
    await expect(page.locator(".answer-reveal")).toContainText("CORRECT");
    await expect(page.getByRole("button", { name: /Lock it in/ })).toHaveCount(0);

    if (questionIndex === 11) {
      await expect(page.locator(".result-stage")).toBeVisible();
    } else {
      await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        String(questionIndex + 2),
      );
      if ((questionIndex + 1) % 3 === 0) {
        const toast = page.locator(".gem-toast");
        await expect(toast).toBeVisible();
        await expect(toast).toContainText("Culture gem unlocked");
        await expect(page.getByRole("dialog", { name: "Culture drop" })).toHaveCount(0);
        await expect(page.locator(".answer-grid > button").first()).toBeEnabled();
      }
    }
  }

  await expect(page.locator(".result-stage")).toBeVisible();
  const classicPrompts = new Set(regions.west.questions.map((question) => normalizePrompt(question.prompt)));
  expect(seenPrompts.some((prompt) => !classicPrompts.has(normalizePrompt(prompt)))).toBe(true);
}

test("homepage loads the complete regional entry surface", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("How much are you worth?");
  await expect(page.getByRole("button", { name: /Find out your bride price/ })).toBeVisible();
  await expect(page.locator(".region-card")).toHaveCount(5);
});

test("every existing regional edition can be started", async ({ page }) => {
  for (const regionKey of regionKeys) {
    await page.goto("/");
    await waitForGameHydration(page);
    await page.locator(`.region-card[data-region="${regionKey}"]`).click();
    await expect(page.locator(`.region-card[data-region="${regionKey}"]`)).toHaveClass(/is-current/);
    await expect(page.getByRole("button", { name: /Find out your bride price/ })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`edition=${regionKey}`));
  }
});

test("avatar selection is reflected in the player portrait", async ({ page }) => {
  await page.goto("/?edition=east");
  await page.getByRole("button", { name: "Dress up first" }).click();
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
  await page.getByRole("button", { name: "Dress up first" }).click();
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
  test.setTimeout(90_000);
  await installShareRecorder(page);
  await completePerfectWestQuiz(page);

  await expect(page.locator(".result-copy .eyebrow")).toHaveText("Your score: 12/12");
  await expect(page.locator(".result-card h1")).toHaveText("Bride Price Royalty");
  await expect(page.locator(".result-card small")).toContainText("Knowledge score 12/12");

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

test("a direct west edition link stays on the start button", async ({ page }) => {
  await page.goto("/?edition=west");
  await expect(page.getByRole("button", { name: /Find out your bride price/ })).toBeVisible();
  await expect(page.locator(".region-card[data-region='west']")).toHaveClass(/is-current/);
});

async function watchForHomeFlash(page: Page) {
  await page.addInitScript(() => {
    window.__wybpHomeSeen = false;
    const loop = () => {
      const home = document.querySelector(".jewel-home");
      if (home) {
        const style = getComputedStyle(home);
        if (style.display !== "none" && style.visibility !== "hidden") window.__wybpHomeSeen = true;
      }
      if (!window.__wybpHomeSeen && !document.querySelector(".question-wrap h2")) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

test("an ad link opens the first question without the home screen", async ({ page }) => {
  await watchForHomeFlash(page);
  await page.goto("/?play=1&edition=west");
  await expect(page.getByRole("heading", { name: "How much are you worth?" })).toBeHidden();
  await waitForGameHydration(page);
  await expect(page.getByRole("progressbar")).toBeVisible();
  await expect(page.locator(".question-wrap h2")).toBeVisible();
  await expect(page.locator(".jewel-home")).toHaveCount(0);
  expect(await page.evaluate(() => window.__wybpHomeSeen)).toBe(false);
});

test("a campaign link skips the home screen", async ({ page }) => {
  await watchForHomeFlash(page);
  await page.goto("/?utm_source=meta&utm_medium=paid&edition=west");
  await expect(page.getByRole("heading", { name: "How much are you worth?" })).toBeHidden();
  await expect(page.locator(".question-wrap h2")).toBeVisible();
  expect(await page.evaluate(() => window.__wybpHomeSeen)).toBe(false);
});

test("the homepage renders within a common mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const start = page.getByRole("button", { name: /Find out your bride price/ });
  await expect(start).toBeVisible();
  const box = await start.boundingBox();
  expect(box).toBeTruthy();
  expect((box?.y ?? 999) + (box?.height ?? 999)).toBeLessThanOrEqual(812);
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

test("a question fits a phone screen and one tap moves on", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?edition=west");
  await page.getByRole("button", { name: /Find out your bride price/ }).click();
  for (let questionNumber = 1; questionNumber <= 4; questionNumber += 1) {
    const answers = page.locator(".answer-grid > button");
    await expect(answers.first()).toBeVisible();
    const count = await answers.count();
    expect(count).toBeGreaterThan(1);
    const first = await answers.first().boundingBox();
    const last = await answers.nth(count - 1).boundingBox();
    expect(first?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(last).toBeTruthy();
    expect((last?.y ?? 999) + (last?.height ?? 999)).toBeLessThanOrEqual(812);
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
    const gridClass = await page.locator(".answer-grid").getAttribute("class");
    const picks = gridClass?.includes("kind-multi") ? 3 : 1;
    for (let pick = 0; pick < picks; pick += 1) await answers.nth(pick).click();
    if (questionNumber === 1) {
      await expect(page.locator(".answer-reveal")).toBeVisible();
      await expect(page.getByRole("button", { name: /Lock it in|Next challenge/ })).toHaveCount(0);
    }
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(questionNumber + 1));
  }
});
