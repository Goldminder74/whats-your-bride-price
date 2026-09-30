import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function touchTargets(locator) {
  for (const control of await locator.all()) {
    if (!await control.isVisible()) continue;
    const box = await control.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `Small touch target: ${await control.innerText()} (${box.width}x${box.height})`);
  }
}

export async function exerciseMobileLayout(page, origin) {
  for (const size of [{ width:320,height:568 }, { width:360,height:640 }, { width:430,height:932 }, { width:844,height:390 }, { width:768,height:1024 }]) {
    await page.setViewportSize(size);
    await page.goto(origin);
    await page.locator("main[data-hydrated='true']").waitFor();
    await expect(page.locator('meta[name="viewport"]')).toHaveCount(1);
    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
    assert.match(viewport, /viewport-fit=cover/);
    assert.doesNotMatch(viewport, /user-scalable=no|maximum-scale=1/);
    await touchTargets(page.locator('.topbar button,.site-legal-footer a'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "No page-level horizontal scroll");
    assert.equal(await page.locator('.region-art[loading="lazy"]').count(), 5);
    await page.getByRole("button", { name: /What is this/ }).click();
    const about = page.getByRole("dialog", { name: "About this game" });
    await expect(about).toBeVisible();
    await touchTargets(about.getByRole("button", { name:"Close about the game" }));
    const sheet = about.locator('.about-sheet');
    assert.equal(await sheet.evaluate(e => e.scrollWidth <= e.clientWidth + 1), true, "About text must wrap, not clip");
    await about.getByRole("button", { name:"Close about the game" }).click();
    await page.getByRole("button", { name:"Privacy choices", exact:true }).click();
    const privacy = page.locator('.privacy-dialog');
    await expect(privacy).toBeVisible();
    await touchTargets(privacy.locator('button,nav a'));
    assert.equal(await privacy.evaluate(e => e.scrollWidth <= e.clientWidth + 1), true);

    await page.goto(`${origin}/?edition=west`);
    await page.locator("main[data-hydrated='true']").waitFor();
    await expect(page.getByRole("button", { name:/Enter Region 0/ })).toBeVisible();
    for (const input of await page.locator('input:not([type=file]):visible').all()) {
      assert.ok(await input.evaluate(e => parseFloat(getComputedStyle(e).fontSize) >= 16));
    }
    await page.getByRole("button", { name:/Enter Region 0/ }).click();
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    await expect(page.getByRole("button", {name:"Privacy choices",exact:true})).not.toBeInViewport();
    await touchTargets(page.locator('.answer-grid button'));
    // Text enlargement is independent of viewport scaling. Answer boxes must grow.
    await page.addStyleTag({ content:'.answer-grid button b {font-size:30px!important}' });
    for (const button of await page.locator('.answer-grid button').all()) {
      assert.equal(await button.evaluate(e => e.scrollWidth <= e.clientWidth + 1), true, "Enlarged answer text remains inside its control");
    }
    await page.locator('.answer-grid button').nth(1).click();
    const next = page.getByRole('button',{name:/Next challenge/});
    await expect(next).toBeFocused();
    await expect(next).toBeInViewport({ratio:1});
    await next.click();
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    await expect(page.locator('.question-wrap h2')).toBeFocused();
    await expect(page.locator('.question-wrap h2')).toBeInViewport({ratio:1});
    if (size.width === 320 || size.height === 390) await page.screenshot({path:join(tmpdir(),`wybp-mobile-${size.width}.png`)});
    assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length), 0, "Reduced motion stops decorative animations");
    console.log(`PASS mobile layout ${size.width}x${size.height}: touch, dialogs, zoom, enlarged text, progression, reduced motion.`);
  }
}
