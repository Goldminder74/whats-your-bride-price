import assert from "node:assert/strict";
import { test } from "node:test";
import {
  approvedAvatarRegistry,
  defaultAvatarId,
  isApprovedAvatarId,
  resolveApprovedAvatar,
  resolveApprovedAvatarId,
} from "../../app/avatarRegistry.ts";

test("preserves exactly twelve unique approved stable avatar IDs", () => {
  assert.equal(approvedAvatarRegistry.length, 12);
  assert.equal(new Set(approvedAvatarRegistry.map(({ id }) => id)).size, 12);
  assert.deepEqual(approvedAvatarRegistry.map(({ id }) => id), ["amara", "zuri", "nia", "lindi", "imara", "aya", "adjoa", "samira", "wanjiku", "mbali", "efe", "malaika"]);
  assert.ok(approvedAvatarRegistry.every(({ src }) => src.startsWith("/avatars/") && !/^https?:/i.test(src)));
});

test("invalid and retired-like IDs resolve to the safe local fallback", () => {
  for (const id of ["https://evil.example/avatar.png", "uploaded-photo", "retired-avatar", null]) {
    assert.equal(isApprovedAvatarId(id), false);
    assert.equal(resolveApprovedAvatarId(id), defaultAvatarId);
    assert.equal(resolveApprovedAvatar(id).id, defaultAvatarId);
  }
});
