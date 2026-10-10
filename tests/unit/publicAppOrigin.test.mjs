import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import {
  createChallengeUrl,
  createPublicAppUrl,
  createResultPreviewUrl,
  createResultUrl,
  PUBLIC_APP_ORIGIN,
  resolveBrowserPublicAppOrigin,
  resolvePublicAppOrigin,
  validatePublicAppOrigin,
} from "../../app/publicAppOrigin.ts";

const canonicalOrigin = "https://brideprice.classesforculture.com";
const stagingOrigin = "https://whats-your-bride-price-staging.ayo43077.chatgpt.site";

test("staging requires explicit exact trusted configuration and rejects untrusted origins", () => {
  for (const mode of ["production", "test", "development"]) {
    assert.throws(() => validatePublicAppOrigin(stagingOrigin, mode));
    assert.equal(resolvePublicAppOrigin(undefined, mode, stagingOrigin), stagingOrigin);
    assert.equal(validatePublicAppOrigin(stagingOrigin, mode, stagingOrigin), stagingOrigin);
    for (const hostile of [
      "https://evil.example",
      canonicalOrigin,
      "http://localhost:3100",
      stagingOrigin + ".evil.example",
      stagingOrigin + ":444",
      stagingOrigin + "/path",
      stagingOrigin + "?origin=" + canonicalOrigin,
      stagingOrigin + "#fragment",
      stagingOrigin.replace("https:", "http:"),
      stagingOrigin.replace("https://", "https://user:password@"),
    ]) assert.throws(() => validatePublicAppOrigin(hostile, mode, stagingOrigin), /Invalid PUBLIC_APP_ORIGIN/);
    for (const hostileConfig of ["", canonicalOrigin, "https://evil.example", stagingOrigin + "/", stagingOrigin + "?review=1"]) {
      assert.throws(() => resolvePublicAppOrigin(undefined, mode, hostileConfig), /Invalid PUBLIC_APP_ORIGIN/);
    }
  }
  assert.equal(resolvePublicAppOrigin(undefined, "production"), canonicalOrigin);
  assert.equal(resolveBrowserPublicAppOrigin(stagingOrigin), canonicalOrigin);
});

test("explicit staging configuration keeps result, challenge, nomination and return URLs on staging", () => {
  const origin = resolvePublicAppOrigin(undefined, "production", stagingOrigin);
  const slug = "a".repeat(48); const hash = "b".repeat(64);
  assert.equal(createResultUrl(slug, origin), `${stagingOrigin}/result/${slug}`);
  assert.equal(createResultPreviewUrl(slug, hash, origin), `${stagingOrigin}/result/${slug}/preview/${hash}.png`);
  assert.equal(createChallengeUrl(slug, origin), `${stagingOrigin}/challenge/${slug}`);
  assert.equal(createPublicAppUrl("/royal-reveal/return", {}, origin), `${stagingOrigin}/royal-reveal/return`);
  assert.throws(() => createPublicAppUrl("/", { origin: canonicalOrigin }, origin));
  assert.throws(() => createPublicAppUrl("/", { returnUrl: canonicalOrigin }, origin));
});

test("build-injected staging origin reaches browser, nomination and sharing consumers without trusting browser origins", () => {
  const originModule = new URL("../../app/publicAppOrigin.ts", import.meta.url).href;
  const nominationModule = new URL("../../app/nominationExperience.ts", import.meta.url).href;
  const shareModule = new URL("../../app/shareProjection.ts", import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    globalThis.__WYBP_STAGING_APP_ORIGIN__ = ${JSON.stringify(stagingOrigin)};
    globalThis.__WYBP_PUBLIC_APP_ORIGIN__ = ${JSON.stringify(stagingOrigin)};
    const origin = await import(${JSON.stringify(originModule)});
    const nomination = await import(${JSON.stringify(nominationModule)});
    const share = await import(${JSON.stringify(shareModule)});
    const expected = ${JSON.stringify(stagingOrigin)};
    assert.equal(origin.PUBLIC_APP_ORIGIN, expected);
    for (const current of [expected, 'https://evil.example', ${JSON.stringify(canonicalOrigin)}]) {
      assert.equal(origin.resolveBrowserPublicAppOrigin(current), expected);
    }
    for (const edition of ['west','east','central','north','south']) {
      const url = nomination.genericNominationUrl(edition, origin.PUBLIC_APP_ORIGIN);
      assert.equal(new URL(url).origin, expected);
      assert.equal(new URL(share.genericShareProjection('result', edition, origin.PUBLIC_APP_ORIGIN).canonicalUrl).origin, expected);
      assert.ok(nomination.genericNominationShareText(edition, url).includes(expected));
    }
    assert.equal(new URL(origin.createChallengeUrl('a'.repeat(48))).origin, expected);
    assert.equal(new URL(origin.createResultUrl('b'.repeat(48))).origin, expected);
    assert.equal(new URL(origin.createPublicAppUrl('/')).origin, expected);
  `;
  const child = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr || child.stdout);
});

test("accepts and exposes the valid production origin", () => {
  assert.equal(validatePublicAppOrigin(canonicalOrigin, "production"), canonicalOrigin);
  assert.equal(PUBLIC_APP_ORIGIN, canonicalOrigin);
});

test("generates stable production and approved local result URLs without query data", () => {
  const slug = "a".repeat(48); const hash = "b".repeat(64);
  assert.equal(createResultUrl(slug), `${canonicalOrigin}/result/${slug}`);
  assert.equal(createResultPreviewUrl(slug, hash), `${canonicalOrigin}/result/${slug}/preview/${hash}.png`);
  const local = validatePublicAppOrigin("http://localhost:3100", "test");
  assert.equal(createResultUrl(slug, local), `http://localhost:3100/result/${slug}`);
  assert.equal(createResultPreviewUrl(slug, hash, local), `http://localhost:3100/result/${slug}/preview/${hash}.png`);
  for (const hostile of ["../private", "%2e%2e", "A".repeat(48), "a".repeat(49), "a".repeat(47) + "/"]) assert.throws(() => createResultUrl(hostile));
  assert.throws(() => createResultPreviewUrl(slug, "https://evil.example/image.png"));
});

test("rejects malformed and protocol-relative origin values", () => {
  for (const value of ["", "not a URL", "://broken", "//evil.example", "\\\\evil.example"]) {
    assert.throws(() => validatePublicAppOrigin(value, "production"), /Invalid PUBLIC_APP_ORIGIN/);
  }
});

test("rejects HTTP, unexpected hostnames, ports and credentials in production", () => {
  const invalidOrigins = [
    "http://brideprice.classesforculture.com",
    "https://evil.example",
    "https://brideprice.classesforculture.com:444",
    "https://user:password@brideprice.classesforculture.com",
  ];
  for (const value of invalidOrigins) {
    assert.throws(() => validatePublicAppOrigin(value, "production"), /Invalid PUBLIC_APP_ORIGIN/);
  }
});

test("accepts local HTTP origins only outside production", () => {
  assert.equal(
    validatePublicAppOrigin("http://localhost:3100", "development"),
    "http://localhost:3100",
  );
  assert.equal(
    validatePublicAppOrigin("http://127.0.0.1:3100", "test"),
    "http://127.0.0.1:3100",
  );
  assert.throws(
    () => validatePublicAppOrigin("http://localhost:3100", "production"),
    /production requires HTTPS/,
  );
});

test("normalises the trailing slash and supplies the canonical default", () => {
  assert.equal(
    validatePublicAppOrigin(`${canonicalOrigin}/`, "production"),
    canonicalOrigin,
  );
  assert.equal(resolvePublicAppOrigin(undefined, "production"), canonicalOrigin);
});

test("generates canonical links while preserving approved paths and query parameters", () => {
  assert.equal(createPublicAppUrl(), `${canonicalOrigin}/`);
  assert.equal(
    createPublicAppUrl("/manifest.webmanifest", { edition: "west", nominated: "1" }),
    `${canonicalOrigin}/manifest.webmanifest?edition=west&nominated=1`,
  );
  assert.equal(
    createPublicAppUrl("/", {
      edition: "east",
      nominated: "1",
      challenge: "East_2026-A",
      source: "whatsapp",
      utm_campaign: "roots_2026",
      ref: "Auntie-7",
    }),
    `${canonicalOrigin}/?edition=east&nominated=1&challenge=East_2026-A&source=whatsapp&utm_campaign=roots_2026&ref=Auntie-7`,
  );
});

test("rejects hostile paths and unapproved query parameters", () => {
  for (const pathname of ["//evil.example/path", "https://evil.example", "javascript:alert(1)", "\\\\evil.example"]) {
    assert.throws(() => createPublicAppUrl(pathname), /Invalid PUBLIC_APP_ORIGIN/);
  }
  assert.throws(
    () => createPublicAppUrl("/", { source: "hostile" }),
    /query parameter source is not approved/,
  );
  assert.throws(
    () => createPublicAppUrl("/", { edition: "//evil.example" }),
    /query parameter edition is not approved/,
  );
  assert.throws(
    () => createPublicAppUrl("/", { challenge: "javascript:alert(1)" }),
    /query parameter challenge is not approved/,
  );
  assert.throws(
    () => createPublicAppUrl("/", { ref: "https://evil.example" }),
    /query parameter ref is not approved/,
  );
});

test("keeps local preview links local but canonicalises non-local fallback hosts", () => {
  assert.equal(
    resolveBrowserPublicAppOrigin("http://127.0.0.1:3100"),
    "http://127.0.0.1:3100",
  );
  assert.equal(
    resolveBrowserPublicAppOrigin("https://whats-your-bride-price.ayo43077.chatgpt.site"),
    canonicalOrigin,
  );
});
