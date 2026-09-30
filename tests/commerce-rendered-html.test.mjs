import assert from "node:assert/strict";
import { readFile,readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

async function render(pathname="/"){const workerUrl=new URL("../dist/server/index.js",import.meta.url);workerUrl.searchParams.set("commerce-test",`${process.pid}-${Date.now()}-${Math.random()}`);const{default:worker}=await import(workerUrl.href);return worker.fetch(new Request(`http://localhost${pathname}`,{headers:{accept:"text/html"}}),{ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});}
async function files(root){const output=[];for(const entry of await readdir(root,{withFileTypes:true})){const path=join(root,entry.name);if(entry.isDirectory())output.push(...await files(path));else output.push(path);}return output;}

test("ordinary production and query parameters cannot expose or enable commerce",async()=>{const response=await render("/?commerce=1&feature_commerce=true&commerce_fixture=active&success=true&paid=true&session_id=cs_fake");assert.equal(response.status,200);const html=await response.text();assert.doesNotMatch(html,/Royal Reveal Pack|Unlock for £1\.99|immediate access to the digital Royal Reveal/i);});
test("commerce routes expose POST handlers only",async()=>{for(const file of ["../app/results/complete/route.ts","../app/commerce/orders/route.ts","../app/commerce/status/route.ts","../app/commerce/entitlement/route.ts","../app/commerce/stripe-webhook/route.ts"]){const source=await readFile(new URL(file,import.meta.url),"utf8");assert.match(source,/export async function POST\(/);assert.doesNotMatch(source,/export (?:async )?function (?:GET|HEAD)\(/);}});
test("ordinary client bundles contain no Stripe signing secret or server configuration",async()=>{const source=(await Promise.all((await files(fileURLToPath(new URL("../dist/client",import.meta.url)))).filter((file)=>/\.(?:js|css|html)$/.test(file)).map((file)=>readFile(file,"utf8")))).join("\n");assert.doesNotMatch(source,/whsec_|STRIPE_WEBHOOK_SIGNING_SECRET|STRIPE_PAYMENT_LINK_ID|ROYAL_REVEAL_AMOUNT_MINOR/i);});
