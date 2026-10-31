// Preserve canonical links issued by the old site without rebuilding or changing
// its deployment, Supabase configuration, functions or email DNS. OFF by default.
export const LEGACY_PROVIDER_ORIGIN='https://6844a06d30342e00087fbdf3--classes-4-culture-goldmindresourcery.netlify.app';
// Literal paths verified in the pinned deployed bundle. Game/legal paths keep
// their new handlers; legacy account/booking return links retain their own router.
const authenticationPaths=new Set(['/verify-email','/login','/forgot-password','/reset-password','/signup','/verification-required','/registration-success','/profile','/classes','/tutors','/tutor-registration','/payment','/tutor-dashboard/availability','/tutor-dashboard/bookings','/tutor-dashboard/classes','/tutor-dashboard/settings']);
export async function legacyContinuity(request:Request,env:{WYBP_LEGACY_CONTINUITY_ENABLED?:string},upstream:typeof fetch=fetch):Promise<Response|null>{
 if(env.WYBP_LEGACY_CONTINUITY_ENABLED!=='true')return null;
 const url=new URL(request.url),shell=authenticationPaths.has(url.pathname)||/^\/(?:classes|tutor)\/[A-Za-z0-9_-]{1,128}$/.test(url.pathname),asset=/^\/assets\/[A-Za-z0-9_.-]{1,180}$/.test(url.pathname);
 if(!shell&&!asset)return null;
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
 // The old immutable deployment returns404 on deep links. Serve its ORIGINAL
 // root shell while leaving the browser URL/query/fragment intact for its router.
 // Never send credentials, cookies, callback query strings or client headers to it.
 const response=await upstream(LEGACY_PROVIDER_ORIGIN+(shell?'/':url.pathname),{method:'GET',redirect:'manual',headers:{Accept:shell?'text/html':'*/*'}});
 const mime=response.headers.get('Content-Type')||'';
 if(response.status!==200||shell&&!mime.toLowerCase().startsWith('text/html'))return new Response('Previous website temporarily unavailable',{status:502,headers:{'Cache-Control':'no-store'}});
 const limit=shell?131072:5242880,reader=response.body?.getReader();if(!reader)return new Response('Previous website temporarily unavailable',{status:502});
 const chunks:Uint8Array[]=[];let length=0;
 for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>limit){await reader.cancel();return new Response('Previous website temporarily unavailable',{status:502,headers:{'Cache-Control':'no-store'}});}chunks.push(part.value);}
 const body=new Uint8Array(length);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
 const headers=new Headers({'Content-Type':mime||'application/octet-stream','Cache-Control':shell?'no-store':'public, max-age=300','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
 // Keep provider security policies; do not forward cookies or redirect headers.
 for(const name of ['Content-Security-Policy','X-Frame-Options']){const value=response.headers.get(name);if(value)headers.set(name,value);}
 return new Response(request.method==='HEAD'?null:body,{status:200,headers});
}
