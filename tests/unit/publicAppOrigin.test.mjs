import assert from "node:assert/strict";
import test from "node:test";
import {
  createPublicAppUrl,
  PUBLIC_APP_ORIGIN,
  resolveBrowserPublicAppOrigin,
  resolvePublicAppOrigin,
  validatePublicAppOrigin,
} from "../../app/publicAppOrigin.ts";

const canonicalOrigin = "https://brideprice.classesforculture.com";

test("accepts and exposes the valid production origin", () => {
  assert.equal(validatePublicAppOrigin(canonicalOrigin, "production"), canonicalOrigin);
  assert.equal(PUBLIC_APP_ORIGIN, canonicalOrigin);
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
