import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { regions } from "../app/gameData.ts";

async function reachable(action) {
  // Check before click(): Playwright's automatic scrolling concealed this bug.
  await expect(action).toBeFocused();
  await expect(action).toBeInViewport({ ratio: 1 });
  await expect.poll(() => action.evaluate(element => {
    const box = element.getBoundingClientRect();
    const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return element === target || element.contains(target);
  })).toBe(true);
}

export async function exerciseRegionalProgression(page, origin) {
  const failures = ["server", "network", "malformed"];
  const errors = [];
  const listener = error => errors.push(error.message);
  page.on("pageerror", listener);
  for (const profile of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(profile);
    for (const [edition, region] of Object.entries(regions)) {
      await page.goto(`${origin}/?edition=${edition}`);
      await page.locator("main[data-hydrated='true']").waitFor();
      await page.getByRole("button", { name: /Enter Region 0/ }).click();
      let expectedScore = 0;
      let imageCount = 0;
      for (const [index, question] of region.questions.entries()) {
        await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(index + 1));
        const image = question.kind === "image";
        const choice = image && profile.width === 390 ? [(question.correct[0] + 1) % 4] : question.correct;
        const correct = !image || profile.width !== 390;
        if (correct) expectedScore++;
        const buttons = page.locator(".answer-grid > button");
        const failure = image ? failures.shift() : undefined;
        const requests = [];
        if (failure) {
          await page.route("**/questions/image-answer", async route => {
            requests.push(route.request().postDataJSON());
            if (requests.length > 1) return route.fallback();
            if (failure === "network") return route.abort("failed");
            return route.fulfill({ status: failure === "server" ? 503 : 200, contentType: "application/json", body: failure === "server" ? "{}" : '{"accepted":true}' });
          });
        }
        if (image) {
          imageCount++;
          await expect(buttons).toHaveCount(4);
          for (const button of await buttons.all()) {
            await expect(button).toHaveAccessibleName(/^Option [A-D]: .{24,}/);
            await expect(button.locator("img")).toHaveAttribute("alt", /.{24,}/);
          }
        }
        for (const option of choice) await buttons.nth(option).click();
        if (question.kind === "multi") await page.getByRole("button", { name: /Lock in 3\/3 answers/ }).click();
        if (failure) {
          const retry = page.getByRole("button", { name: "Retry answer", exact: true });
          await reachable(retry);
          await expect(page.getByRole("alert")).toContainText("could not be checked");
          await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(index + 1));
          await expect(page.getByRole("button", { name: /Next challenge|Reveal my result/ })).toHaveCount(0);
          await retry.click();
        }
        const reveal = page.locator('.answer-reveal[role="status"]');
        await expect(reveal).toContainText(correct ? "CORRECT" : "NOW YOU KNOW");
        if (failure) {
          assert.equal(requests.length, 2);
          assert.deepEqual(requests[1], requests[0], "Retry resubmits only the original choice");
          await page.unroute("**/questions/image-answer");
        }
        const action = reveal.getByRole("button", { name: index === 11 ? /Reveal my result/ : /Next challenge/ });
        await reachable(action);
        await action.click();
        if (index < 11) {
          await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(index + 2));
          if ((index + 1) % 3 === 0) await page.getByRole("button", { name: /Claim gem/ }).click();
        }
      }
      const result = page.locator(".result-stage");
      await expect(result).toBeVisible();
      await expect(result.locator(".knowledge-note")).toContainText(`You answered ${expectedScore} of 12 correctly`);
      await expect(result.getByRole("button", { name: "Play another edition", exact: true })).toBeVisible();
      assert.equal(imageCount, 2);
      console.log(`PASS ${profile.width}x${profile.height} ${edition}: 12 answers, 2 image progressions, result ${expectedScore}/12; controls focused, in viewport and unobstructed before clicking.`);
    }
  }
  assert.deepEqual(errors, []);
  page.off("pageerror", listener);
}
