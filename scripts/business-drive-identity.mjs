// Read-only preflight, not account provisioning or paid/processing-contract proof.
// about.get accepts drive.file; no broader scope is needed:
// https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get
const endpoint='https://www.googleapis.com/drive/v3/about?fields=user(emailAddress),storageQuota';
const expectedIdentity='backup-operator@classesforculture.com';
const output=(status,identityMatches=false,quota=null)=>Object.freeze({status,identityMatches,quotaVerified:quota!==null,limitBytes:quota?.limit??null,usageBytes:quota?.usage??null,freeBytes:quota?Math.max(0,quota.limit-quota.usage):null,paidStatusVerified:false});
const counter=value=>{
 if(typeof value!=='string'||!/^(?:0|[1-9][0-9]{0,15})$/.test(value))return null;
 const number=Number(value);return Number.isSafeInteger(number)&&number>=0?number:null;
};
export async function verifyBusinessDriveIdentity({accessToken,fetcher=(input,init)=>globalThis.fetch(input,init)}={}){
 if(typeof accessToken!=='string'||accessToken.length<9||accessToken.length>8192||!/^[A-Za-z0-9._~+/-]+=*$/.test(accessToken)||typeof fetcher!=='function')return output('configuration_unverified');
 let response;
 try{response=await fetcher(endpoint,{method:'GET',redirect:'manual',headers:{Authorization:'Bearer '+accessToken,Accept:'application/json'},signal:AbortSignal.timeout(15000)});}catch{return output('provider_unavailable');}
 if(!response||response.status!==200||response.redirected===true)return output('provider_unavailable');
 let data;try{data=await response.json();}catch{return output('response_unverified');}
 if(!data||typeof data!=='object'||Array.isArray(data)||!data.user||typeof data.user.emailAddress!=='string')return output('response_unverified');
 if(data.user.emailAddress!==expectedIdentity)return output('identity_mismatch');
 const quota=data.storageQuota,limit=counter(quota?.limit),usage=counter(quota?.usage);
 if(!quota||typeof quota!=='object'||Array.isArray(quota)||limit===null||usage===null)return output('quota_unverified',true);
 return output(usage>limit?'quota_exceeded':'verified',true,{limit,usage});
}
