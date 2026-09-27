import assert from "node:assert/strict";

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

  // Retained failing journey and assertions: hydration, quiz entry, then the
  // Privacy return Link. Do not replace this with goto() or suppress its error.
  await page.goto(origin + "/?edition=west");
  await game();
  await page.getByRole("button", { name: /Enter Region 01/ }).click();
  await page.getByRole("progressbar").waitFor();
  await page.goto(origin + "/privacy");
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
  await page.goto(origin + "/?edition=west");
  await game();
  await page.reload();
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
  await page.goto(origin + "/privacy");
  await privacy();
  await page.reload();
  await privacy();
  assert.equal(new URL(page.url()).pathname, "/privacy");
  assert.ok(componentResponses.length >= 3, "Multiple real component navigations must complete");
  assert.ok(componentResponses.every(status => status === 200), "Component responses must succeed");
  assert.deepEqual(errors, [], "No uncaught browser or hydration errors");
  console.log(`PASS compiled navigation: ${origin}; return, round trip, Terms, history, query, direct/refresh; ${componentResponses.length} RSC responses; no document fallback/errors.`);
}
