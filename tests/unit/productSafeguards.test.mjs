import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PRODUCT_SAFEGUARD,
  RESULT_TIER_COPY,
  RESULT_TIER_GIFTS,
  RESULT_TIER_TITLES,
  SAFE_RESULT_SHARE_SUFFIX,
  SCORING_PRINCIPLES,
} from "../../app/productSafeguards.ts";
import { APPROVED_BRIDE_PRICE_CONTEXTS, auditCopySources } from "../copy-safety-audit.mjs";
import { SHARE_MEDIA_HEIGHT, SHARE_MEDIA_SAFE_INSET, SHARE_MEDIA_WIDTH } from "../../app/shareMedia.ts";
import { prepareShareMedia } from "../../app/shareMedia.ts";
import { createRoyalRevealProjection } from "../../app/royalRevealProjection.ts";
import { prepareRoyalCertificate, prepareRoyalPortrait, royalStoryProjection, ROYAL_PORTRAIT_STYLES } from "../../app/royalRevealMedia.ts";
import { drawStoryVideoFrame } from "../../app/storyVideo.ts";
import { ROYAL_REVEAL_PRODUCT_KEY } from "../../db/commerceContracts.ts";

const APP_COPY_FILES = [
  "app/BridePriceGame.tsx",
  "app/layout.tsx",
  "app/page.tsx",
  "app/productSafeguards.ts",
];

test("keeps the cultural-score explanation in FAQ/footer only", async () => {
  assert.equal(PRODUCT_SAFEGUARD, "A playful culture score, never a measure of human worth.");
  assert.equal(SAFE_RESULT_SHARE_SUFFIX, "Can you beat my culture score?");
  for (const path of ["BridePriceGame.tsx", "ShareCentre.tsx", "NominateThreePanel.tsx", "StoryVideoPanel.tsx", "RoyalRevealPack.tsx", "RoyalRevealOffer.tsx", "shareCopy.ts", "nominationExperience.ts", "shareMedia.ts", "storyVideo.ts", "resultMetadata.ts"]) {
    const source = await readFile(new URL(`../../app/${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /PRODUCT_SAFEGUARD|human worth|projection\.safeguard\}/, path);
  }
  for (const path of ["faq/page.tsx", "AnalyticsConsent.tsx"]) {
    const source = await readFile(new URL(`../../app/${path}`, import.meta.url), "utf8");
    assert.match(source, /PRODUCT_SAFEGUARD|never a measure of human worth/);
  }
});

test("documents scoring principles and keeps every result tier non-shaming", () => {
  assert.equal(SCORING_PRINCIPLES.length, 5);
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

test("sentence-case reward captions preserve every reward and apply to all tiers", () => {
  const original = [
    ["a curiosity crown", "a comeback invitation"],
    ["a promising culture report", "one trunk of celebration fabric"],
    ["the aunties’ approving nod", "front-row status at the function"],
    ["a five-auntie standing ovation", "a knowledge victory dance"],
  ];
  for (const [tier, gift] of RESULT_TIER_GIFTS.entries()) {
    for (const [index, caption] of gift.slice(1).entries()) {
      assert.equal(caption, original[tier][index][0].toUpperCase() + original[tier][index].slice(1));
    }
  }
  assert.equal(SHARE_MEDIA_WIDTH, 1080);
  assert.equal(SHARE_MEDIA_HEIGHT, 1920);
  assert.ok(SHARE_MEDIA_SAFE_INSET >= 78);
});

test("all five regions and four tiers omit repetitive explanations from generated media", async () => {
  const originals = { Image: globalThis.Image, document: globalThis.document };
  const drawn = [];
  const context = new Proxy({}, { get: (_, key) => key === "fillText" ? value => drawn.push(value)
    : key === "measureText" ? value => ({ width: value.length * 10 })
    : key === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {},
  set: () => true });
  const canvas = () => ({ width: 0, height: 0, getContext: () => context, toBlob: callback => callback(new Blob(["synthetic canvas recorder"], { type: "image/png" })) });
  globalThis.Image = class {
    width = 1080; height = 1920; naturalWidth = 1080; naturalHeight = 1920;
    set src(_) { queueMicrotask(() => this.onload()); }
  };
  globalThis.document = { createElement: tag => { assert.equal(tag, "canvas"); return canvas(); } };
  try {
    for (const edition of ["west", "east", "central", "north", "south"]) {
      for (const [tier, score] of [0, 3, 6, 9].entries()) {
        drawn.length = 0;
        const projection = createRoyalRevealProjection({ active: true, productKey: ROYAL_REVEAL_PRODUCT_KEY,
          resultSlug: "d".repeat(48), edition, score, maximumScore: 12, resultTitle: RESULT_TIER_TITLES[tier], avatarId: "adjoa" });
        assert.ok(projection);
        await prepareRoyalCertificate(canvas(), projection);
        for (const style of ROYAL_PORTRAIT_STYLES) await prepareRoyalPortrait(canvas(), projection, style);
        await prepareShareMedia({ edition, score, maximumScore: 12, resultTitle: RESULT_TIER_TITLES[tier], avatarId: "adjoa", displayName: "A challenger" });
        drawStoryVideoFrame(context, royalStoryProjection(projection), { avatar: new Image(), regionalArtwork: new Image() }, 5000, true);
        assert.ok(drawn.includes(RESULT_TIER_TITLES[tier]));
        assert.ok(drawn.includes(`${score} / 12`));
        assert.doesNotMatch(drawn.join("\n"), /human worth|not a valuation|not a legal|never a measure/i, `${edition}/${tier}`);
      }
    }
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
