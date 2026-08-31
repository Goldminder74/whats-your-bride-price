import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { activeFeatureFlags } from "../../app/featureFlags.ts";
import { legalInformation, missingLegalActivationDetails } from "../../app/legalConfig.ts";
import { retentionSchedule } from "../../app/retentionSchedule.ts";
import { clearApplicationLocalData, localStorageAllowlist, sessionStorageAllowlist, sessionStoragePrefixAllowlist, storageInventory, STORAGE_NOTICE_VERSION } from "../../app/storageInventory.ts";
import { RESULT_COMPLETION_RETENTION_MS } from "../../db/resultCompletion.ts";
import { toPublicResult } from "../../db/dataContracts.ts";

class MemoryStorage {
  values = new Map();
  get length(){return this.values.size;}
  key(index){return [...this.values.keys()][index]??null;}
  getItem(key){return this.values.get(key)??null;}
  setItem(key,value){this.values.set(key,String(value));}
  removeItem(key){this.values.delete(key);}
}

test("canonical inventory uses a controlled public schema without secret values",()=>{
  assert.equal(STORAGE_NOTICE_VERSION,"privacy-storage-notice-v1");assert.ok(storageInventory.length>=20);
  const required=["key","name","technology","browserKey","keyPattern","party","provider","purpose","category","data","trigger","existsBeforeChoice","requiresAnalyticsConsent","strictlyFunctional","retention","leavesDevice","userCanClear","clearing","sourceModules","noticeVersion","state"];
  assert.equal(new Set(storageInventory.map((item)=>item.key)).size,storageInventory.length);
  for(const item of storageInventory){assert.deepEqual(Object.keys(item).sort(),[...required].sort(),item.key);assert.equal(item.noticeVersion,STORAGE_NOTICE_VERSION);assert.ok(item.name&&item.purpose&&item.retention);}
  const publicJson=JSON.stringify(storageInventory);assert.doesNotMatch(publicJson,/[0-9a-f]{32,64}/i);assert.doesNotMatch(publicJson,/whsec_|sk_(?:live|test)|deletion token value|owner hash value/i);
});

test("clear my local data removes only the explicit application allowlist",()=>{
  const local=new MemoryStorage();const session=new MemoryStorage();
  for(const key of localStorageAllowlist)local.setItem(key,"owned");for(const key of sessionStorageAllowlist)session.setItem(key,"owned");
  session.setItem(`${sessionStoragePrefixAllowlist[0]}review-scope`,"owned");local.setItem("unrelated-local","keep");session.setItem("unrelated-session","keep");
  const result=clearApplicationLocalData(local,session);
  assert.equal(result.removed.length,localStorageAllowlist.length+sessionStorageAllowlist.length+1);
  for(const key of localStorageAllowlist)assert.equal(local.getItem(key),null,key);for(const key of sessionStorageAllowlist)assert.equal(session.getItem(key),null,key);
  assert.equal(local.getItem("unrelated-local"),"keep");assert.equal(session.getItem("unrelated-session"),"keep");
});

test("every application browser-storage access module is registered",async()=>{
  const entries=await readdir(new URL("../../app/",import.meta.url),{recursive:true,withFileTypes:true});
  const storageModules=[];
  for(const entry of entries){if(!entry.isFile()||!/[.](?:ts|tsx)$/.test(entry.name))continue;const path=resolve(entry.parentPath,entry.name);const source=await readFile(path,"utf8");if(/(?:localStorage|sessionStorage|StorageLike|Storage,\s*snapshot|Pick<Storage)/.test(source))storageModules.push(`app/${path.split(/[/\\]app[/\\]/).pop().replaceAll("\\","/")}`);}
  const registered=new Set(storageInventory.flatMap((item)=>item.sourceModules));
  const intentionallyReadOnly=new Set(["app/entryDiagnostics.ts","app/retentionSchedule.ts","app/storageInventory.ts"]);
  assert.deepEqual(storageModules.filter((module)=>!registered.has(module)&&!intentionallyReadOnly.has(module)),[]);
});

test("privacy defaults and consent boundaries remain strict",async()=>{
  assert.equal(activeFeatureFlags.first_party_analytics,false);assert.equal(activeFeatureFlags.commerce,false);assert.equal(activeFeatureFlags.owner_dashboard,false);
  const source=await readFile(new URL("../../app/AnalyticsConsent.tsx",import.meta.url),"utf8");
  assert.match(source,/Allow analytics/);assert.match(source,/Do not allow/);assert.doesNotMatch(source,/defaultChecked|checked=\{true\}/i);assert.match(source,/no advertising[\s\S]*marketing consent/i);
  assert.match(source,/clearApplicationLocalData/);assert.doesNotMatch(source,/localStorage\.clear|sessionStorage\.clear|indexedDB\.deleteDatabase|caches\.keys/);
  assert.match(source,/if\(fixture\).*No analytics request was sent/s);assert.match(source,/sessionCredential\.current=null/);
});

test("90 days from completion is authoritative and publication cannot mutate expiry",async()=>{
  const day=86_400_000;assert.equal(RESULT_COMPLETION_RETENTION_MS,90*day);
  const now=Date.UTC(2026,7,31,12);const record={id:"result",publicSlug:"a".repeat(48),editionKey:"west",score:9,total:12,tier:3,scoringVersion:"binary-exact-set-v1",safeAvatarId:"adjoa",reviewedDisplayName:null,safeguardVersion:"culture-score-v1",visibility:"public",state:"active",createdAt:now-90*day,expiresAt:now};
  assert.equal(toPublicResult({...record,expiresAt:now+1},now)?.expiresAt,now+1);assert.equal(toPublicResult(record,now),null);assert.equal(toPublicResult({...record,expiresAt:now+1},now+2),null);
  const publication=await readFile(new URL("../../db/resultPublication.ts",import.meta.url),"utf8");const update=publication.match(/UPDATE results SET[\s\S]*?WHERE id = \?3/)?.[0]||"";assert.match(update,/SET visibility = \?1/);assert.doesNotMatch(update,/SET[\s\S]*expires_at\s*=/i);
});

test("retention and draft legal configuration stay honest",()=>{
  const results=retentionSchedule.find((item)=>item.category.startsWith("Completed attempts"));const published=retentionSchedule.find((item)=>item.category.startsWith("Published results"));
  assert.match(results.maximum,/Exactly 90 days from completion/);assert.match(published.maximum,/publication never extends, restarts or removes expiry/i);
  assert.equal(legalInformation.approvedForProduction,false);assert.equal(legalInformation.controllerLegalName,null);assert.equal(legalInformation.privacyContact,null);assert.ok(missingLegalActivationDetails.length>=10);
});

test("repository contains no inaccurate permanent-result promise and no migration 0007",async()=>{
  const roots=[new URL("../../app/",import.meta.url),new URL("../../docs/",import.meta.url),new URL("../../tests/",import.meta.url)];let combined="";
  for(const root of roots){for(const entry of await readdir(root,{recursive:true,withFileTypes:true})){if(!entry.isFile()||entry.name==="privacyControls.test.mjs"||!/[.](?:ts|tsx|mjs|md)$/.test(entry.name))continue;combined+=`\n${await readFile(resolve(entry.parentPath,entry.name),"utf8")}`;}}
  assert.doesNotMatch(combined,/permanent (?:public )?result|permanent (?:result )?(?:page|link|route|url)|permanent-result/i);
  const migrations=await readdir(new URL("../../drizzle/",import.meta.url));assert.equal(migrations.some((name)=>/^0007_/.test(name)),false);
});
