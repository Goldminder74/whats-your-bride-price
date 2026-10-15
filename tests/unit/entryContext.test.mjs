import assert from "node:assert/strict";
import test from "node:test";
import {
  controlledSources,
  entryContextFromRecord,
  entryContextToQuery,
  inferControlledSource,
  parseEntryContext,
} from "../../app/entryContext.ts";

test("declares the exact controlled source enumeration", () => {
  assert.deepEqual(controlledSources, [
    "whatsapp", "facebook", "instagram", "tiktok", "copy", "native", "direct", "unknown",
  ]);
});

test("normalises supported sources and rejects arbitrary source trust", () => {
  for (const source of controlledSources) {
    assert.equal(parseEntryContext(`source=${source.toUpperCase()}`).source, source);
  }
  const unknown = parseEntryContext("source=LinkedIn");
  assert.equal(unknown.source, "unknown");
  assert.equal(unknown.invalidFields.includes("source"), false);
});

test("accepts only registered editions and legacy nomination value one", () => {
  for (const edition of ["west", "east", "central", "north", "south"]) {
    assert.equal(parseEntryContext(`edition=${edition.toUpperCase()}&nominated=1`).edition, edition);
  }
  assert.deepEqual(parseEntryContext("edition=moon&nominated=true").invalidFields, ["edition", "nominated"]);
});

test("validates challenge shape without trusting a challenge record", () => {
  assert.equal(parseEntryContext("challenge=West_2026-A").challenge, "West_2026-A");
  for (const hostile of ["tiny", "https://evil.example", "javascript:alert(1)", "//evil.example", "<script>"]) {
    const parsed = parseEntryContext(`challenge=${encodeURIComponent(hostile)}`);
    assert.equal(parsed.challenge, undefined);
    assert.equal(parsed.invalidFields.includes("challenge"), true);
  }
});

test("bounds campaign fields and rejects duplicated, script-like and protocol-like values", () => {
  const valid = parseEntryContext("utm_source=whatsapp&utm_medium=social&utm_campaign=roots_2026&ref=Auntie-7");
  assert.equal(valid.source, "whatsapp");
  assert.equal(valid.utm_campaign, "roots_2026");
  assert.equal(valid.ref, "Auntie-7");

  const hostile = parseEntryContext(
    `utm_campaign=${"a".repeat(81)}&utm_medium=${encodeURIComponent("javascript:alert(1)")}&ref=${encodeURIComponent("//evil.example")}&edition=west&edition=east`,
  );
  assert.deepEqual(hostile.invalidFields, ["edition", "utm_medium", "utm_campaign", "ref"]);
  assert.equal(hostile.edition, undefined);
});

test("infers only a coarse controlled source from referrers", () => {
  assert.equal(inferControlledSource(""), "direct");
  assert.equal(inferControlledSource("https://l.instagram.com/redirect"), "instagram");
  assert.equal(inferControlledSource("https://m.facebook.com/story"), "facebook");
  assert.equal(inferControlledSource("https://www.tiktok.com/t/abc"), "tiktok");
  assert.equal(inferControlledSource("https://example.com/private/path?secret=1"), "unknown");
  assert.equal(inferControlledSource("not a url"), "unknown");
});

test("preserves only permitted context through a regional navigation", () => {
  const current = parseEntryContext("utm_campaign=roots_2026&ref=Auntie-7&challenge=West_2026-A&nominated=1&source=whatsapp");
  const query = entryContextToQuery(current, { edition: "west" });
  assert.equal(query.get("edition"), "west");
  assert.equal(query.get("utm_campaign"), "roots_2026");
  assert.equal(query.get("ref"), "Auntie-7");
  assert.equal(query.get("challenge"), "West_2026-A");
  assert.equal(query.get("nominated"), "1");
  assert.equal(query.get("source"), "whatsapp");
  assert.equal(query.has("invalidFields"), false);
});

test("server record parsing preserves duplicate detection", () => {
  const parsed = entryContextFromRecord({ edition: ["west", "east"], source: "native" });
  assert.equal(parsed.edition, undefined);
  assert.deepEqual(parsed.invalidFields, ["edition"]);
});
