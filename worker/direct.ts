import application from './index.ts';
import {directIngress,type DirectEnvironment} from './directIngress.ts';
import type {HostingOrigin} from '../app/hostingOrigin.ts';
declare const __WYBP_HOSTING_ORIGIN__:HostingOrigin;
export default {
 fetch(request:Request,env:Parameters<typeof application.fetch>[1]&DirectEnvironment,ctx:Parameters<typeof application.fetch>[2]):Promise<Response>{
  return directIngress(request,env,__WYBP_HOSTING_ORIGIN__,async trusted=>{
   const path=new URL(trusted.url).pathname;
   if(['GET','HEAD'].includes(trusted.method)&&!trusted.headers.has('rsc')&&(/^\/(?:_next\/static|quiz-art|regions|avatars)\//.test(path)||/^\/[^/]+\.(?:svg|png|ico|webmanifest)$/.test(path)))return env.ASSETS.fetch(trusted);
   return application.fetch(trusted,env,ctx);
  });
 },
};
