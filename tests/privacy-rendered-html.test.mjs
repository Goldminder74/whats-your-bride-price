import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname="/"){
  const workerUrl=new URL("../dist/server/index.js",import.meta.url);workerUrl.searchParams.set("privacy-test",`${process.pid}-${Date.now()}-${Math.random()}`);const{default:worker}=await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${pathname}`,{headers:{accept:"text/html"}}),{ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});
}

test("privacy choices and legal footer render site-wide while analytics stays off",async()=>{
  for(const path of ["/","/privacy","/privacy/storage","/terms","/community-standards","/privacy/retention","/privacy/requests"]){const response=await render(path);assert.equal(response.status,200,path);const html=await response.text();assert.match(html,/Privacy choices/i,path);assert.match(html,/Privacy requests/i,path);assert.match(html,/not professionally approved|not approved for production/i,path);}
});

test("legal routes fail safely without invented controller details",async()=>{
  const privacy=await(await render("/privacy")).text();assert.match(privacy,/Controller legal identity/);assert.match(privacy,/do not send personal information/i);assert.doesNotMatch(privacy,/privacy@[a-z]|company number:\s*\w|ICO registration number:\s*\w/i);
  const requests=await(await render("/privacy/requests")).text();assert.match(requests,/stores no request and contains no form/i);assert.doesNotMatch(requests,/<form|<input|<textarea/i);
});

test("storage notice and machine inventory stay synchronised",async()=>{
  const notice=await(await render("/privacy/storage")).text();const response=await render("/privacy/storage/inventory");assert.equal(response.status,200);const inventory=await response.json();assert.equal(inventory.noticeVersion,"privacy-storage-notice-v1");assert.ok(inventory.entries.length>=20);for(const item of inventory.entries)assert.match(notice,new RegExp(item.name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i"));
});

test("ordinary query parameters cannot enable privacy fixtures or analytics",async()=>{
  const html=await(await render("/?privacy_fixture=public_result_notice&first_party_analytics=true")).text();assert.doesNotMatch(html,/data-privacy-review-fixture|data-analytics-consent/i);assert.match(html,/Privacy choices/i);
  const output=await readFile(new URL("../app/featureFlags.ts",import.meta.url),"utf8");assert.match(output,/first_party_analytics:\s*false/);
});

test("public notices contain the completion-based expiry and no permanent promise",async()=>{
  const files=["../app/ShareCentre.tsx","../app/result/[slug]/page.tsx","../docs/dynamic-result-preview-contract.md","../docs/share-centre-platform-contract.md"];
  const source=(await Promise.all(files.map((file)=>readFile(new URL(file,import.meta.url),"utf8")))).join("\n");assert.match(source,/90 days after (?:you completed the quiz|authoritative quiz completion)/i);assert.match(source,/publishing does not restart|publishing never restarts/i);assert.match(source,/unpublish(?:ing)? or (?:valid )?deletion.*sooner/i);assert.doesNotMatch(source,/permanent (?:public )?result|permanent (?:page|link|route)/i);
});
