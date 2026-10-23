import {timingSafeEqual} from 'node:crypto';
import {validateHostingOrigin,type HostingOrigin} from '../app/hostingOrigin.ts';

export type DirectEnvironment=Readonly<{
 WYBP_AUTHORITY_ROLE?:string;WYBP_DIRECT_ORIGIN?:string;WYBP_PUBLIC_ACCESS_ENABLED?:string;
 WYBP_PRIVATE_ACCESS_TOKEN?:string;WYBP_LIVE_WEBHOOK_ENABLED?:string;
}>;
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const denied=(status=404)=>new Response(null,{status,headers});
function authorised(request:Request,secret:unknown):boolean {
 if(typeof secret!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(secret))return false;
 let token=request.headers.get('authorization')||'';
 if(token.startsWith('Bearer '))token=token.slice(7);
 else if(token.startsWith('Basic ')){try{const pair=atob(token.slice(6));if(!pair.startsWith('operator:'))return false;token=pair.slice(9);}catch{return false;}}
 else return false;
 const value=Buffer.from(token),expected=Buffer.from(secret);return value.length===expected.length&&timingSafeEqual(value,expected);
}
/** Direct origin only. Preparation is private by default, including assets.
 * Forwarding headers never select an origin or grant identity. The exact live
 * webhook can remain signature-verified during a frontend rollback.
 */
export async function directIngress(request:Request,env:DirectEnvironment,hosting:HostingOrigin,application:(r:Request)=>Promise<Response>):Promise<Response>{
 try {
  const origin=validateHostingOrigin(hosting),url=new URL(request.url);
  if(hosting.platform!=='cloudflare-direct'||env.WYBP_AUTHORITY_ROLE!=='production-app'||env.WYBP_DIRECT_ORIGIN!==origin||url.origin!==origin||url.protocol!=='https:')return denied();
  const path=url.pathname;
  if(/^\/owner(?:\/|$)/.test(path)||['/signin-with-chatgpt','/signout-with-chatgpt','/callback','/commerce/stripe-test-webhook'].includes(path))return denied();
  if(env.WYBP_PUBLIC_ACCESS_ENABLED!==undefined&&!['true','false'].includes(env.WYBP_PUBLIC_ACCESS_ENABLED))return denied();
  const publicAccess=env.WYBP_PUBLIC_ACCESS_ENABLED==='true'&&hosting.environment==='production';
  if(env.WYBP_PUBLIC_ACCESS_ENABLED==='true'&&!publicAccess)return denied();
  const webhook=path==='/commerce/stripe-webhook';
  if(webhook&&(hosting.environment!=='production'||env.WYBP_LIVE_WEBHOOK_ENABLED!=='true'||request.method!=='POST'||url.search))return denied();
  if(!publicAccess&&!webhook&&!authorised(request,env.WYBP_PRIVATE_ACCESS_TOKEN))return denied(401);
  const clean=new Headers(request.headers);
  for(const name of [...clean.keys()])if(name==='authorization'||name==='host'||name==='forwarded'||name.startsWith('x-forwarded-')||name.startsWith('x-nf-')||name.startsWith('oai-')||name.startsWith('cf-'))clean.delete(name);
  const response=await application(new Request(request,{headers:clean}));
  const out=new Headers(response.headers);for(const [name,value]of Object.entries(headers))out.set(name,value);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:out});
 }catch{return denied(503);}
}
