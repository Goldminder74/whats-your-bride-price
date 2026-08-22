import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { entryEventNames } from "../../app/entryEvents.ts";

test("declares only the approved first-party entry instrumentation hooks", () => {
  assert.deepEqual(entryEventNames, [
    "entry_view",
    "entry_shell_visible",
    "entry_interactive",
    "entry_retry",
    "entry_context_invalid",
  ]);
});

test("mobile entry CSS includes dynamic viewport, safe-area, focus and reduced-motion safeguards", async () => {
  const css = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /100vh[\s\S]*100dvh/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-right\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /env\(safe-area-inset-left\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:(?:44|48|52|58)px/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test("review diagnostics require build-time authorisation and cannot use query activation", async () => {
  const vite = await readFile(new URL("../../vite.config.ts", import.meta.url), "utf8");
  const diagnostics = await readFile(new URL("../../app/entryDiagnostics.ts", import.meta.url), "utf8");
  assert.match(vite, /WYBP_REVIEW_DIAGNOSTICS/);
  assert.match(vite, /WYBP_REVIEW_BUILD/);
  assert.match(vite, /__WYBP_REVIEW_DIAGNOSTICS__/);
  assert.doesNotMatch(diagnostics, /URLSearchParams|location\.search|diagnostics=1/);
});
