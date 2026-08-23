import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PRODUCT_SAFEGUARD,
  RESULT_MEDIA_SAFEGUARD,
  RESULT_TIER_COPY,
  RESULT_TIER_GIFTS,
  RESULT_TIER_TITLES,
  SAFE_RESULT_SHARE_SUFFIX,
  SCORING_PRINCIPLES,
} from "../../app/productSafeguards.ts";
import { APPROVED_BRIDE_PRICE_CONTEXTS, auditCopySources } from "../copy-safety-audit.mjs";

const APP_COPY_FILES = [
  "app/BridePriceGame.tsx",
  "app/layout.tsx",
  "app/page.tsx",
  "app/productSafeguards.ts",
];

test("uses the permanent safeguard verbatim across entry, result, media and share surfaces", async () => {
  assert.equal(PRODUCT_SAFEGUARD, "A playful culture score, never a measure of human worth.");
  assert.equal(RESULT_MEDIA_SAFEGUARD.text, PRODUCT_SAFEGUARD);
  assert.ok(SAFE_RESULT_SHARE_SUFFIX.endsWith(PRODUCT_SAFEGUARD));
  const source = await readFile(new URL("../../app/BridePriceGame.tsx", import.meta.url), "utf8");
  for (const id of ["generic-entry-safeguard", "direct-entry-safeguard", "trusted-challenge-safeguard", "avatar-entry-safeguard", "setup-entry-safeguard"]) {
    assert.match(source, new RegExp(`id="${id}"`));
    assert.match(source, new RegExp(`aria-describedby="${id}"`));
  }
  assert.match(source, /className="result-safeguard reveal-safeguard">\{PRODUCT_SAFEGUARD\}/);
  assert.match(source, /className="result-card-safeguard">\{PRODUCT_SAFEGUARD\}/);
  assert.match(source, /ctx\.fillText\(RESULT_MEDIA_SAFEGUARD\.text/);
});

test("documents all seven scoring principles and keeps every result tier non-shaming", () => {
  assert.equal(SCORING_PRINCIPLES.length, 7);
  assert.equal(RESULT_TIER_TITLES.length, 4);
  assert.equal(RESULT_TIER_COPY.length, 4);
  assert.equal(RESULT_TIER_GIFTS.length, 4);
  for (const copy of RESULT_TIER_COPY) assert.doesNotMatch(copy, /worth less|low value|unsuitable|financially prepared|raised the bride price/i);
  for (const gift of RESULT_TIER_GIFTS) assert.match(gift[0], /^Ceremonial cowrie score:/);
});

test("copy-safety audit has a narrow reviewed allowlist and no high-risk phrase violations", async () => {
  assert.ok(APPROVED_BRIDE_PRICE_CONTEXTS.every(({ reason }) => reason.length >= 12));
  const sources = await Promise.all(APP_COPY_FILES.map(async (path) => ({ path, content: await readFile(new URL(`../../${path}`, import.meta.url), "utf8") })));
  assert.deepEqual(auditCopySources(sources), []);
});

test("question, answer, explanation and cultural wording source is byte-for-byte unchanged", async () => {
  const data = await readFile(new URL("../../app/gameData.ts", import.meta.url));
  assert.equal(createHash("sha256").update(data).digest("hex"), "3ce3474de2e6b072bf4e893fc2760c8b9ba996a889697ec5ac15f631cc05c74d");
});

test("export safeguard stays inside the portrait safe area", () => {
  assert.equal(RESULT_MEDIA_SAFEGUARD.canvasWidth, 1080);
  assert.ok(RESULT_MEDIA_SAFEGUARD.baselineY > 0);
  assert.ok(RESULT_MEDIA_SAFEGUARD.baselineY <= 1350 - RESULT_MEDIA_SAFEGUARD.horizontalSafeInset);
});
