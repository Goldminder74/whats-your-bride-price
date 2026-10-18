// Existing CLI credentials only; never print provider response bodies or tokens.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const account='b6b22a9a87b5758725e5c499782160af';
async function get(url,token){
 const response=await fetch(url,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)return {status:response.status};
 return {status:response.status,data:await response.json()};
}
try{
 const auth=await readFile(join(process.env.APPDATA,'xdg.config','.wrangler','config','default.toml'),'utf8');
 const token=auth.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/m)?.[1];
 if(!token)throw Error();
 for(const route of ['subscriptions','d1/database']){
  const result=await get(`https://api.cloudflare.com/client/v4/accounts/${account}/${route}`,token);
  console.log(JSON.stringify({provider:'cloudflare',operation:route,status:result.status,success:result.data?.success===true,
   ...(route==='subscriptions'&&Array.isArray(result.data?.result)?{plans:result.data.result.map(x=>({name:x.rate_plan?.public_name||x.rate_plan?.id,price:x.price,currency:x.currency,state:x.state}))}:{}),
   ...(route==='d1/database'&&Array.isArray(result.data?.result)?{databaseCount:result.data.result.length,benchmarkMatches:result.data.result.filter(x=>x.name==='wybp-capacity-d1-r002').length,
    totalDatabaseBytes:result.data.result.every(x=>Number.isSafeInteger(x.file_size)&&x.file_size>=0)?result.data.result.reduce((n,x)=>n+x.file_size,0):'unknown'}:{}),
  }));
 }
}catch{console.log(JSON.stringify({provider:'cloudflare',status:'read_unavailable'}));}
try{
 let config;
 for(const path of [join(process.env.APPDATA,'netlify','Config','config.json'),join(process.env.APPDATA,'netlify','config.json'),join(process.env.USERPROFILE,'.netlify','config.json')]){
  try{config=JSON.parse(await readFile(path,'utf8'));break;}catch{/* Try only known CLI configuration locations. */}
 }
 const token=config?.users?.[config.userId]?.auth?.token;
 if(!token)throw Error();
 const result=await get('https://api.netlify.com/api/v1/accounts',token);
 const team=Array.isArray(result.data)?result.data.find(x=>x.slug==='goldminder74'):null;
 console.log(JSON.stringify({provider:'netlify',operation:'accounts',status:result.status,teamVerified:!!team,
  ...(team?{plan:team.type_slug,automaticRecharge:team.automatic_recharge??'unknown'}:{})}));
 // Available credits and actual tax/FX quote require authoritative billing evidence.
}catch{console.log(JSON.stringify({provider:'netlify',status:'read_unavailable'}));}
