import assert from "node:assert/strict";
import { test } from "node:test";
import {
  displayNameMaximumGraphemes,
  publicDisplayNameFallback,
  safeDisplayNameOrFallback,
  validateDisplayName,
} from "../../app/displayNames.ts";

test("keeps names optional and normalises Unicode, diacritics and whitespace", () => {
  assert.deepEqual(validateDisplayName("   "), { valid: true, value: null, graphemeCount: 0 });
  assert.equal(validateDisplayName("  Adaugo    Nwafor  ").value, "Adaugo Nwafor");
  assert.equal(validateDisplayName("Jose\u0301").value, "José");
  assert.equal(validateDisplayName("نُور").value, "نُور");
  assert.equal(validateDisplayName("Ọláìyá").value, "Ọláìyá");
});

test("counts grapheme clusters rather than UTF-16 code units", () => {
  const family = "👩🏿‍👩🏾‍👧🏽‍👧🏿";
  assert.equal(validateDisplayName(family.repeat(displayNameMaximumGraphemes)).valid, true);
  assert.equal(validateDisplayName(family.repeat(displayNameMaximumGraphemes + 1)).valid, false);
});

test("rejects controls, nulls, invisible bidi controls and HTML payloads", () => {
  for (const value of ["Ada\u0000Eze", "Ada\nEze", "Ada\u202eEze", "Ada\u2066Eze", "Ada\u200bEze", "<script>alert(1)</script>", "Ada<img src=x>"]) {
    const result = validateDisplayName(value);
    assert.equal(result.valid, false, JSON.stringify(value));
    assert.doesNotMatch(result.message, /script|control|null|bidi|xss/i);
  }
});

test("uses a neutral public fallback and never Guest", () => {
  assert.equal(safeDisplayNameOrFallback(""), publicDisplayNameFallback);
  assert.notEqual(publicDisplayNameFallback, "Guest");
  assert.equal(safeDisplayNameOrFallback("<script>"), publicDisplayNameFallback);
});
