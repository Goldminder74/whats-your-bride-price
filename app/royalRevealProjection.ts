import { isApprovedAvatarId } from "./avatarRegistry.ts";
import { calculateResultTier } from "./gameLogic.ts";
import { regions, type RegionKey } from "./gameData.ts";
import { PRODUCT_SAFEGUARD, RESULT_TIER_TITLES } from "./productSafeguards.ts";
import type { EntitlementProjection } from "../db/commerce.ts";
import { ROYAL_REVEAL_PRODUCT_KEY } from "../db/commerceContracts.ts";

const verifiedEntitlement = Symbol("verifiedRoyalRevealEntitlement");
export type RoyalRevealProjection = Readonly<EntitlementProjection & { safeguard: typeof PRODUCT_SAFEGUARD; [verifiedEntitlement]: true }>;

export function createRoyalRevealProjection(value: unknown): RoyalRevealProjection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null; const candidate=value as Record<string,unknown>;
  if(candidate.active!==true||candidate.productKey!==ROYAL_REVEAL_PRODUCT_KEY||typeof candidate.resultSlug!=="string"||!/^[0-9a-f]{48}$/.test(candidate.resultSlug)||typeof candidate.edition!=="string"||!(candidate.edition in regions)||!Number.isInteger(candidate.score)||!Number.isInteger(candidate.maximumScore)||typeof candidate.resultTitle!=="string"||typeof candidate.avatarId!=="string")return null;
  const edition=candidate.edition as RegionKey; const region=regions[edition]; const score=candidate.score as number;
  if(candidate.maximumScore!==region.questions.length||score<0||score>region.questions.length||candidate.resultTitle!==RESULT_TIER_TITLES[calculateResultTier(score)]||!isApprovedAvatarId(candidate.avatarId))return null;
  return Object.freeze({active:true,productKey:ROYAL_REVEAL_PRODUCT_KEY,resultSlug:candidate.resultSlug,edition,score,maximumScore:region.questions.length,resultTitle:candidate.resultTitle,avatarId:candidate.avatarId,safeguard:PRODUCT_SAFEGUARD,[verifiedEntitlement]:true as const});
}

export function requireRoyalRevealProjection(value: unknown): RoyalRevealProjection {
  if (!value || typeof value!=="object" || (value as Record<PropertyKey,unknown>)[verifiedEntitlement]!==true) throw new Error("royal_reveal_entitlement_required");
  const projection=value as RoyalRevealProjection; if(!createRoyalRevealProjection(projection))throw new Error("royal_reveal_entitlement_invalid"); return projection;
}
