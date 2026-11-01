import type {FeatureFlags} from './featureFlags.ts';
export const productionGates=Object.freeze(['authorityRecovery','capacity5000','outage48h','retention','monitoring','purchaseConfirmations','sellerLegalTax','stripeConfiguration','rollback'] as const);
/** Operator-produced evidence, never request data. A capability build is not
 * public activation; deployment/runtime gates remain separately mandatory. */
export function productionBuildReadiness(value:unknown,flags:FeatureFlags,origin:string,now=Date.now()):boolean {
 if(!Object.values(flags).some(Boolean))return false;
 const fail=():never=>{throw Error('production_readiness_required');};
 if(!value||typeof value!=='object'||Array.isArray(value))return fail();
 const v=value as Record<string,unknown>,checks=v.checks as Record<string,unknown>;
 if(v.version!==1||v.target!=='cloudflare-direct'||v.origin!==origin||typeof v.sourceRevision!=='string'||!/^[a-f0-9]{40}$/.test(v.sourceRevision)||typeof v.evidenceSha256!=='string'||!/^[a-f0-9]{64}$/.test(v.evidenceSha256)||!Number.isSafeInteger(v.verifiedAt)||!Number.isSafeInteger(v.expiresAt)||(v.verifiedAt as number)>now||(v.expiresAt as number)<=now||(v.expiresAt as number)-(v.verifiedAt as number)>86400000||!checks||productionGates.some(k=>checks[k]!==true))return fail();
 if(Object.entries(flags).some(([key,on])=>on&&!['random_quick_play','cowrie_economy','commerce'].includes(key)))return fail();
 return true;
}
