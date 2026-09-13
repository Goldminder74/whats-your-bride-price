import { avatarChoices } from "./publicGameData.ts";
import type { AvatarChoice } from "./gameData.ts";

export const approvedAvatarRegistry: readonly Readonly<AvatarChoice>[] = Object.freeze(
  avatarChoices.map((avatar) => Object.freeze({ ...avatar })),
);

const avatarById = new Map(approvedAvatarRegistry.map((avatar) => [avatar.id, avatar]));
export const defaultAvatarId = approvedAvatarRegistry[0].id;

export function isApprovedAvatarId(value: unknown): value is string {
  return typeof value === "string" && avatarById.has(value);
}

export function resolveApprovedAvatar(value: unknown): Readonly<AvatarChoice> {
  return isApprovedAvatarId(value) ? avatarById.get(value)! : avatarById.get(defaultAvatarId)!;
}

export function resolveApprovedAvatarId(value: unknown): string {
  return resolveApprovedAvatar(value).id;
}
