import { COMMERCE_MAX_BODY_BYTES } from "../db/commerceContracts.ts";
import { PUBLIC_APP_ORIGIN } from "./publicAppOrigin.ts";

export function commerceJson(body: Readonly<Record<string, unknown>>, status: number): Response { return Response.json(body,{status,headers:{"cache-control":"no-store","content-security-policy":"default-src 'none'; frame-ancestors 'none'","cross-origin-resource-policy":"same-origin","referrer-policy":"no-referrer","x-content-type-options":"nosniff"}}); }
export function safeCommerceRequest(request: Request): boolean { const url=new URL(request.url); const local=["localhost","127.0.0.1","[::1]"].includes(url.hostname); if(request.method!=="POST" || (url.protocol!=="https:"&&!local) || (!local && url.origin!==PUBLIC_APP_ORIGIN))return false; if(request.headers.get("origin")!==url.origin||request.headers.get("sec-fetch-site")!=="same-origin")return false; const mode=request.headers.get("sec-fetch-mode"); return mode==="cors"||mode==="same-origin"; }
export async function readLimitedCommerceBody(request: Request, limit: number): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared)>limit)) throw new Error("size");
  if (!request.body) throw new Error("body");
  const reader=request.body.getReader(); const chunks:Uint8Array[]=[]; let size=0;
  try { for (;;) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new Error("size");}chunks.push(value);} }
  finally { reader.releaseLock(); }
  if (!size) throw new Error("body");
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder("utf-8",{fatal:true}).decode(bytes);
}
export async function readCommerceJson(request:Request):Promise<unknown>{ if((request.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase()!=="application/json")throw new Error("content_type"); return JSON.parse(await readLimitedCommerceBody(request,COMMERCE_MAX_BODY_BYTES)); }
