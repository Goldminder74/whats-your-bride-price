import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { regions } from "../app/gameData.ts";
import { classicAnswerButton } from "./classic-answer-button.ts";

// A private hosting gateway needs its HttpOnly cookie on the actual browser
// request. Checking the request (not a mocked fetch option) catches omit again.
export async function exerciseCompiledImageAnswer(page, origin, legacyTransportProbe = false) {
  const errors = [];
  const onError = error => errors.push(error.message);
  page.on("pageerror", onError);
  await page.context().addCookies([{
    name: "compiled_private_access", value: "local-test-only", url: origin,
    httpOnly: true, secure: origin.startsWith("https:"), sameSite: "Strict",
  }]);
  await page.goto(origin + "/?edition=west");
  await page.locator("main[data-hydrated='true']").waitFor();
  await page.getByRole("button", { name: /Enter Region 01/ }).click();
  for (let index = 1; index <= 3; index++) {
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(index));
    await page.locator(".answer-grid > button").first().click();
    if (index === 3) {
      await page.locator(".answer-grid > button").nth(1).click();
      await page.locator(".answer-grid > button").nth(2).click();
      await page.getByRole("button", { name: /Lock in 3\/3 answers/ }).click();
    }
    await page.locator(".answer-reveal").getByRole("button", { name: /Next challenge/ }).click();
  }
  await page.getByRole("button", { name: /Claim gem/ }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "4");
  if (legacyTransportProbe) {
    // Reproduce the old client transport on WebKit's real network stack, then
    // restore fetch before Retry. Neither response nor headers are mocked.
    await page.evaluate(() => {
      const original = window.fetch;
      window.fetch = (input, init) => {
        if (input === "/questions/image-answer") {
          window.fetch = original;
          return original(input, { ...init, mode: "same-origin" });
        }
        return original(input, init);
      };
    });
    const rejectedPromise = page.waitForResponse(response => new URL(response.url()).pathname === "/questions/image-answer");
    await classicAnswerButton(page, "west", 3, regions.west.questions[3], 0).click();
    const rejected = await rejectedPromise;
    assert.equal((await rejected.request().allHeaders()).origin, "null");
    assert.equal(rejected.status(), 403, "Opaque origins remain rejected");
    await expect(page.getByRole("alert")).toContainText("could not be checked");
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "4");
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === "/questions/image-answer");
    await page.getByRole("button", { name: "Retry answer", exact: true }).click();
    assert.equal((await responsePromise).status(), 200);
    await expect(page.locator(".answer-reveal")).toContainText("CORRECT");
    console.log("PASS WebKit regression: old Origin:null rejected with 403; unchanged canonical choice retried with corrected transport and accepted.");
    await page.reload();
    await page.locator("main[data-hydrated='true']").waitFor();
    // This independent probe is complete. The normal journey below checks the
    // fresh app request, cookie, origin, response and reveal from start to finish.
    page.off("pageerror", onError);
    assert.deepEqual(errors, []);
    return exerciseCompiledImageAnswer(page, origin);
  }
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === "/questions/image-answer");
  await classicAnswerButton(page, "west", 3, regions.west.questions[3], 0).click();
  const response = await responsePromise;
  const headers = await response.request().allHeaders();
  assert.match(headers.cookie || "", /(?:^|; )compiled_private_access=local-test-only(?:;|$)/);
  assert.equal(headers.origin, origin);
  assert.equal(headers.referer, undefined, "No page path or query is transmitted as a referrer");
  // Playwright can omit network-generated Fetch Metadata from allHeaders().
  // The Sites harness audits it at the receiving server without interception;
  // the signed proxy harness models it explicitly and tests hostile values.
  assert.equal(response.status(), 200);
  const judgement = await response.json();
  assert.equal(judgement.accepted, true);
  assert.equal(judgement.correct, true);
  await expect(page.locator(".answer-reveal")).toContainText("CORRECT");
  assert.deepEqual(errors, []);
  page.off("pageerror", onError);
  console.log("PASS compiled image answer: HttpOnly same-origin cookie, Origin/Fetch Metadata, authoritative judgement and reveal.");
}

// Shared by both compiled targets. A document marker detects MPA fallbacks;
// actual component responses prove we exercised the compiled RSC client router.
export async function exerciseCompiledNavigation(page, origin) {
  const errors = [];
  const componentResponses = [];
  let documents = 0;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++; });
  page.on("response", response => {
    if (response.headers()["content-type"]?.includes("text/x-component")) componentResponses.push(response.status());
  });
  const game = () => page.locator("main[data-hydrated='true']").waitFor();
  const privacy = () => page.getByRole("heading", { name: "Privacy Notice", exact: true }).waitFor();
  const marker = "compiled-navigation-document";
  let documentCount;
  async function markDocument() {
    await page.evaluate(value => { window.__compiledNavigationDocument = value; }, marker);
    documentCount = documents;
  }
  async function sameDocument() {
    assert.equal(await page.evaluate(() => window.__compiledNavigationDocument), marker, "Link/history must retain the document");
    assert.equal(documents, documentCount, "No full-page fallback may conceal broken RSC navigation");
  }
  const legalLink = name => page.getByRole("navigation", { name: "Legal and privacy", exact: true }).getByRole("link", { name, exact: true });
  async function direct(url) {
    // Let genuine Link prefetches finish before intentionally replacing the
    // document. WebKit can report aborted in-flight prefetches as CORS errors.
    // Keep every error assertion; make the test's hard navigation deterministic.
    await page.waitForLoadState("networkidle");
    await page.goto(url);
  }
  async function refresh() {
    await page.waitForLoadState("networkidle");
    await page.reload();
  }

  // Retained failing journey and assertions: hydration, quiz entry, then the
  // Privacy return Link. Do not replace this with goto() or suppress its error.
  await direct(origin + "/?edition=west");
  await game();
  await page.getByRole("button", { name: /Enter Region 01/ }).click();
  await page.getByRole("progressbar").waitFor();
  await direct(origin + "/privacy");
  await privacy();
  await markDocument();
  await page.getByRole("link", { name: "Return to the game" }).click();
  try { await game(); }
  catch (error) {
    console.error(JSON.stringify({ url: page.url(), componentResponses, errors, body: (await page.locator("body").innerText()).slice(0, 1000) }));
    throw error;
  }
  await page.waitForURL(origin + "/");
  await sameDocument();
  assert.ok(componentResponses.length > 0, "Next-style Link navigation uses the RSC path");
  assert.deepEqual(errors, []);

  await legalLink("Privacy").click();
  await privacy();
  await page.waitForURL(origin + "/privacy");
  await sameDocument();
  await page.getByRole("link", { name: "Return to the game" }).click();
  await game();
  await page.waitForURL(origin + "/");
  await sameDocument();
  await legalLink("Terms").click();
  await page.waitForURL(origin + "/terms");
  await page.locator(".legal-document h1").waitFor();
  await sameDocument();
  await page.goBack();
  await game();
  await page.waitForURL(origin + "/");
  await sameDocument();
  await page.goForward();
  await page.waitForURL(origin + "/terms");
  await page.locator(".legal-document h1").waitFor();
  await sameDocument();

  // The return Link deliberately targets '/'. History must still restore the
  // original entry query; direct loads and refresh must retain it as well.
  await direct(origin + "/?edition=west");
  await game();
  await refresh();
  await game();
  assert.equal(new URL(page.url()).search, "?edition=west");
  await markDocument();
  await legalLink("Privacy").click();
  await privacy();
  await sameDocument();
  await page.goBack();
  await game();
  await page.waitForURL(origin + "/?edition=west");
  await sameDocument();
  await page.goForward();
  await privacy();
  await sameDocument();
  await direct(origin + "/privacy");
  await privacy();
  await refresh();
  await privacy();
  assert.equal(new URL(page.url()).pathname, "/privacy");
  assert.ok(componentResponses.length >= 3, "Multiple real component navigations must complete");
  assert.ok(componentResponses.every(status => status === 200), "Component responses must succeed");
  assert.deepEqual(errors, [], "No uncaught browser or hydration errors");
  console.log(`PASS compiled navigation: ${origin}; return, round trip, Terms, history, query, direct/refresh; ${componentResponses.length} RSC responses; no document fallback/errors.`);
}
