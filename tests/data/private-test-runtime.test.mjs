import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp,readFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test,{before,after} from "node:test";
import { Adapter,setup,config,request,checkout,verified,balance,adverse,credential } from "../helpers/cowrieCommerce.mjs";
import { applyMigrationPlan,createIsolatedDatabase,loadMigrationPlan } from "../../scripts/data-migrations.mjs";
import { loadEvidence,seedPlan,regionPlan,publicationManifestPath,sha256,executeTargetBatch,regions,SCHEMA_QUERY } from "../../scripts/private-test-catalogue.mjs";
import { canonicalEvidenceJson } from "../../db/questionEvidence.ts";
import { D1QuestionSelectionRepository,selectQuestionSet } from "../../db/questionSelection.ts";
import { D1CommerceRateLimiter } from "../../db/commerceRateLimit.ts";
import { CommerceService } from "../../db/commerce.ts";
import { createRoyalRevealProjection } from "../../app/royalRevealProjection.ts";
import { calculateResultTier } from "../../app/gameLogic.ts";
import { RESULT_TIER_TITLES } from "../../app/productSafeguards.ts";
import { runTestRetention } from "../../db/testRetention.ts";
import { PRIVATE_TEST,assertPrivateTestFlags,privateTestRuntimeReady,validateTestDatabaseId } from "../../app/privateTestProfile.ts";
import { defaultFeatureFlags } from "../../app/featureFlags.ts";
import { privatePostOptions } from "../../app/privatePost.ts";
import { TEST_WEBHOOK_PATH,testWebhook } from "../../worker/testWebhook.ts";
import { cowrieProductKeys,cowrieProducts } from "../../db/cowrieProducts.ts";
import { Miniflare } from "miniflare";
import { developmentSeedStatements } from "../../db/seeds/development.ts";
import { completeCowrieQuickPlay } from "../../db/cowrieCompletion.ts";
import { deriveAnonymousSubjectHash } from "../../app/anonymousSession.ts";
import { assertSecretFreeBuild } from "../../scripts/secret-free-build.mjs";
import { releaseConfiguration } from "../../scripts/netlify-release.mjs";
import { writeFile } from "node:fs/promises";

const now=Date.UTC(2026,9,5,16);
let directory,data,plan;
before(async()=>{
  directory=await mkdtemp(join(tmpdir(),"wybp-test-catalogue-"));
  await promisify(execFile)(process.execPath,["--experimental-strip-types","scripts/build-machine-evidence-question-bank.mjs","--output",directory],{windowsHide:true});
  data=await loadEvidence(directory,now);plan=await loadMigrationPlan();
});
after(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
const bind=(adapter,statements)=>statements.map(row=>adapter.prepare(row.sql).bind(...row.params));
async function dbFixture(){const db=createIsolatedDatabase();applyMigrationPlan(db,plan,{now});return{db,adapter:new Adapter(db)};}
async function seedPublish(adapter){await adapter.batch(bind(adapter,seedPlan(data.seed)));for(const region of regions){await adapter.batch(bind(adapter,regionPlan("import",region,data,now)));await adapter.batch(bind(adapter,regionPlan("publish",region,data,now)));}}

test("proposal reproduces exactly, reserves/drafts excluded; seed/import/publication are atomic, separate and idempotent",async()=>{
  assert.deepEqual(data.manifest,JSON.parse(await readFile(publicationManifestPath,"utf8")));
  assert.equal(data.manifest.entries.length,90);assert.equal(data.manifest.humanCulturalApproval,false);
  assert.deepEqual(data.manifest.selectedOriginalDraftVersions,[]);assert.equal(data.manifest.requiresOriginalDraftPublicationDecision,false);
  const city=data.manifest.entries.find(entry=>entry.draftProvenance);assert.equal(city.stableId,"west_e_897218520e14659da149e286");
  assert.equal(city.draftProvenance.stableId,"west_cabo_verde_cidade_velha_island");
  assert.ok(!data.manifest.entries.some(entry=>entry.stableId===city.draftProvenance.stableId));
  const {db,adapter}=await dbFixture();
  try{
    adapter.failAt=70;await assert.rejects(adapter.batch(bind(adapter,seedPlan(data.seed))));assert.equal(db.prepare("SELECT COUNT(*) n FROM quiz_editions").get().n,0);adapter.failAt=-1;
    await adapter.batch(bind(adapter,seedPlan(data.seed)));await adapter.batch(bind(adapter,seedPlan(data.seed)));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM questions").get().n,60);
    const repository=new D1QuestionSelectionRepository(adapter);
    for(const region of regions){
      const imports=regionPlan("import",region,data,now);
      adapter.failAt=85;await assert.rejects(adapter.batch(bind(adapter,imports)));adapter.failAt=-1;
      assert.equal(db.prepare("SELECT COUNT(*) n FROM question_evidence_verifications WHERE question_id IN (SELECT id FROM questions WHERE edition_id=?)").get(`edition_${region}_v1`).n,0);
      await adapter.batch(bind(adapter,imports));await adapter.batch(bind(adapter,imports));
      assert.equal((await repository.getCandidates(region,now)).length,12,"import never publishes");
      const publish=regionPlan("publish",region,data,now);
      await adapter.batch(bind(adapter,publish));await adapter.batch(bind(adapter,publish));await adapter.batch(bind(adapter,imports));
      const candidates=await repository.getCandidates(region,now);assert.equal(candidates.length,30);
      const selection=await selectQuestionSet({region,candidates,now,randomSource:bytes=>{bytes.fill(7);return bytes;},minimumEligibleCount:30});assert.equal(selection.questions.length,12);
      assert.equal((await repository.getCandidates(region,Date.parse(data.manifest.entries[0].expiresAt))).length,12,"evidence expiry immediately removes extra authority");
    }
    assert.equal(db.prepare("SELECT COUNT(*) n FROM questions").get().n,150);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM question_evidence_verifications").get().n,90);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM questions WHERE reviewed_by IS NOT NULL").get().n,0);
  }finally{db.close();}
});

test("partial/conflicting catalogues, sources, proof and expired evidence fail without overwriting",async()=>{
  const partial=await dbFixture();
  try {
    await partial.adapter.batch(bind(partial.adapter,developmentSeedStatements(data.seed).slice(0,-1)));
    await assert.rejects(partial.adapter.batch(bind(partial.adapter,seedPlan(data.seed))));
    assert.equal(partial.db.prepare("SELECT COUNT(*) n FROM questions").get().n,59);
  } finally { partial.db.close(); }
  const {db,adapter}=await dbFixture();
  try{
    await adapter.batch(bind(adapter,seedPlan(data.seed)));
    db.prepare("UPDATE questions SET valid_until=? WHERE stable_id='west_q01'").run(now);
    await assert.rejects(adapter.batch(bind(adapter,seedPlan(data.seed))));
    assert.equal(db.prepare("SELECT valid_until FROM questions WHERE stable_id='west_q01'").get().valid_until,now);
    db.prepare("UPDATE questions SET valid_until=NULL WHERE stable_id='west_q01'").run();
    await adapter.batch(bind(adapter,regionPlan("import","west",data,now)));
    db.prepare("DELETE FROM question_sources WHERE id=(SELECT id FROM question_sources LIMIT 1)").run();
    await assert.rejects(adapter.batch(bind(adapter,regionPlan("import","west",data,now))));assert.equal(db.prepare("SELECT COUNT(*) n FROM question_sources").get().n,35);
    await assert.rejects(adapter.batch(bind(adapter,regionPlan("publish","west",data,now))));
    await assert.rejects(loadEvidence(directory,Date.parse(data.manifest.entries[0].expiresAt)),/expired|recheck/);
  }finally{db.close();}
});

test("operator target identity and migration ledger must match before a write; dry runs perform no network",async()=>{
  const id="11111111-2222-4333-8444-555555555555";let calls=0;
  const fetcher=async()=>{calls++;return Response.json({success:true,result:{uuid:id,name:"production"}});};
  await assert.rejects(executeTargetBatch({databaseId:id,token:"synthetic",plan:seedPlan(data.seed),migrations:data.manifest.migrations,fetcher}),/identity/);assert.equal(calls,1);
  const hash=sha256(await readFile(publicationManifestPath));assert.equal(hash.length,64);
  const out=await promisify(execFile)(process.execPath,["--experimental-strip-types","scripts/private-test-catalogue.mjs","--evidence",directory,"--operation","seed"],{windowsHide:true});assert.equal(JSON.parse(out.stdout).dryRun,true);
});

test("D1 commerce limiter admits exactly twenty concurrent requests across instances and fails closed",async()=>{
  const {db,adapter}=await dbFixture();try{
    const a=new D1CommerceRateLimiter(adapter),b=new D1CommerceRateLimiter(adapter);
    const results=await Promise.all(Array.from({length:40},(_,i)=>(i%2?a:b).consume("a".repeat(64),now)));
    assert.equal(results.filter(x=>x==="allowed").length,20);assert.equal(results.filter(x=>x==="limited").length,20);
    assert.equal(await a.consume("a".repeat(64),now+60000),"allowed");assert.equal(await b.consume("b".repeat(64),now),"allowed");
    assert.equal(await new D1CommerceRateLimiter({prepare(){throw Error("offline");}}).consume("a".repeat(64),now),"unavailable");
    assert.equal(await a.consume("bad",now),"unavailable");assert.notEqual(db.prepare("SELECT rate_key_hash FROM daily_operation_limits LIMIT 1").get().rate_key_hash,"a".repeat(64));
  }finally{db.close();}
});

test("real local D1 engine accepts unchanged migrations, atomic operator guards and RETURNING concurrency",async()=>{
  const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('local');}}",compatibilityDate:"2026-05-15",d1Databases:["DB"]});
  try{
    const db=await mf.getD1Database("DB");
    for(const migration of plan)await db.batch(migration.statements.map(sql=>db.prepare(sql)));
    const schema=await db.prepare(SCHEMA_QUERY).all();assert.equal(sha256(canonicalEvidenceJson(schema.results)),data.manifest.schemaSha256);
    await seedPublish(db);
    assert.equal((await db.prepare("SELECT COUNT(*) n FROM questions").first()).n,150);
    const outcomes=await Promise.all(Array.from({length:25},()=>new D1CommerceRateLimiter(db).consume("a".repeat(64),now)));
    assert.equal(outcomes.filter(x=>x==="allowed").length,20);
  }finally{await mf.dispose();}
});

function runtime(adapter){const env={...PRIVATE_TEST,WYBP_PRIVATE_TEST_PROFILE:"payments",WYBP_NETLIFY_SITE_URL:PRIVATE_TEST.origin,WYBP_NETLIFY_PROJECT_ID:PRIVATE_TEST.projectId,
  WYBP_TEST_WORKER_ORIGIN:PRIVATE_TEST.workerOrigin,WYBP_TEST_WEBHOOK_ENABLED:"true",DB:adapter,
  STRIPE_EXPECTED_LIVEMODE:"false",STRIPE_PAYMENT_LINK_URL:config.publicPaymentLinkUrl,STRIPE_PAYMENT_LINK_ID:config.expectedPaymentLinkId,
  STRIPE_WEBHOOK_SIGNING_SECRET:config.webhookSigningSecret,ROYAL_REVEAL_PRODUCT_KEY:config.expectedProductKey,ROYAL_REVEAL_AMOUNT_MINOR:199,ROYAL_REVEAL_CURRENCY:"GBP"};
  for(const key of cowrieProductKeys){const prefix=key.toUpperCase();const product=cowrieProducts[key];Object.assign(env,{[`${prefix}_LIVEMODE`]:"false",[`${prefix}_PAYMENT_LINK_URL`]:config.cowrieBundles[key].publicPaymentLinkUrl,[`${prefix}_PAYMENT_LINK_ID`]:config.cowrieBundles[key].expectedPaymentLinkId,[`${prefix}_PRODUCT_KEY`]:key,[`${prefix}_QUANTITY`]:product.quantity,[`${prefix}_AMOUNT_MINOR`]:product.amountMinor,[`${prefix}_CURRENCY`] :"GBP"});}return env;}
test("only exact test POST webhook bypasses owner login; signature/live-mode/host/route limits precede storage",async()=>{
  let queries=0;const env=runtime({prepare(){queries++;throw Error("must not query");}});
  const body=JSON.stringify({id:"evt_local_test",type:"checkout.session.completed",livemode:true,data:{object:{}}});
  const signature=`t=${now/1000},v1=${createHmac("sha256",config.webhookSigningSecret).update(`${now/1000}.${body}`).digest("hex")}`;
  const req=(path=TEST_WEBHOOK_PATH,origin=PRIVATE_TEST.workerOrigin,method="POST",sig=signature,raw=body)=>new Request(origin+path,{method,headers:{"content-type":"application/json","stripe-signature":sig},...(method==="POST"?{body:raw}:{})});
  assert.equal((await testWebhook(req(),env,"payments",()=>now)).status,400);
  assert.equal((await testWebhook(req(TEST_WEBHOOK_PATH,PRIVATE_TEST.workerOrigin,"POST","bad"),env,"payments",()=>now)).status,400);
  for(const request of [req(TEST_WEBHOOK_PATH,PRIVATE_TEST.origin),req(TEST_WEBHOOK_PATH+"/"),req(TEST_WEBHOOK_PATH+"?x=1"),req(TEST_WEBHOOK_PATH,PRIVATE_TEST.workerOrigin,"GET"),req("/commerce/stripe-webhook"),req(TEST_WEBHOOK_PATH,PRIVATE_TEST.workerOrigin.replace("https:","http:"))])assert.equal((await testWebhook(request,env,"payments",()=>now)).status,404);
  assert.equal((await testWebhook(req(),env,"data",()=>now)).status,404);
  assert.equal((await testWebhook(req(),{...env,WYBP_TEST_WEBHOOK_ENABLED:"false"},"payments",()=>now)).status,404);
  assert.equal((await testWebhook(req(),{...env,STRIPE_EXPECTED_LIVEMODE:"true"},"payments",()=>now)).status,503);
  assert.equal(queries,0);
});

test("operational limiter preserves ownership, purchase/refund/dispute reconciliation and concurrency",async()=>{
  const c=await setup();try{
    const service=new CommerceService(c.repository,new D1CommerceRateLimiter(c.adapter),config,()=>Date.UTC(2026,8,12,12),{cowriePurchasesEnabled:true});
    await assert.rejects(service.startOrder({...request(c),anonymousSessionCredential:"b".repeat(32)}));
    const [a,b]=await Promise.all([service.startOrder(request(c)),service.startOrder(request(c))]);assert.equal(a.publicOrderReference,b.publicOrderReference);
    const event=await verified("checkout.session.completed",checkout(a));await Promise.all([service.webhook(event),service.webhook(event)]);assert.equal(balance(c).purchased_balance,5);
    await c.walletService.clear({anonymousSessionCredential:credential});
    const dispute=await verified("charge.dispute.created",adverse());await service.webhook(dispute);
    assert.equal(balance(c).purchased_balance,0);assert.equal(c.database.prepare("SELECT state FROM cowrie_wallets").get().state,"frozen");
    assert.equal(c.database.prepare("SELECT reason_code FROM cowrie_ledger WHERE entry_type='refund_reversal'").get().reason_code,"verified_dispute");
  }finally{c.database.close();}
});

test("bounded maintenance expires authority and bonuses without deleting financial history or extending retention",async()=>{
  const c=await setup();try{
    const at=Date.UTC(2026,8,12,12);
    c.database.prepare("INSERT INTO daily_operation_limits(id,rate_key_hash,action,window_started_at,request_count,expires_at,created_at,updated_at) VALUES('retention_fixture',?,'start',?,1,?,?,?)").run("c".repeat(64),at-60000,at,at-60000,at-60000);
    const before=c.database.prepare("SELECT COUNT(*) n FROM cowrie_wallets").get().n;
    const order=await c.service.startOrder(request(c));await c.service.webhook(await verified("checkout.session.completed",checkout(order)));
    const wallet=c.database.prepare("SELECT id FROM cowrie_wallets").get();
    c.database.prepare("INSERT INTO cowrie_ledger(id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,related_achievement_key,reason_code,bonus_expires_at,created_at) VALUES(?,?,'bonus','bonus_credit',2,'bonus',?,'daily_streak_7:all:daily-streak-v1','daily_streak_7',?,?)").run(`ledger_${"f".repeat(32)}`,wallet.id,"f".repeat(64),at+180*86400000,at);
    const first=await runTestRetention(c.adapter,at,1);assert.equal(first.changes[0],1);
    const second=await runTestRetention(c.adapter,at,1);assert.deepEqual(second.changes,[0,0,0,0]);
    assert.equal(c.database.prepare("SELECT COUNT(*) n FROM cowrie_wallets").get().n,before);
    await assert.rejects(runTestRetention(c.adapter,at,101));
    assert.equal(c.database.prepare("SELECT state FROM cowrie_wallets").get().state,"active");
    const expiredAt=at+180*86400000;
    const expired=await runTestRetention(c.adapter,expiredAt,1);assert.equal(expired.bonusExpiries,2);assert.equal(balance(c).purchased_balance,5);assert.equal(balance(c).bonus_balance,0);
    assert.equal((await runTestRetention(c.adapter,expiredAt,1)).bonusExpiries,0);
    assert.equal(c.database.prepare("SELECT COUNT(*) n FROM cowrie_ledger WHERE entry_type='bonus_credit'").get().n,1);
    assert.equal(c.database.prepare("SELECT COUNT(*) n FROM cowrie_purchase_allocations").get().n,1);
  }finally{c.database.close();}
});

test("authoritative completion is owner-bound/idempotent and retains attempt and result for exactly ninety days",async()=>{
  const c=await setup();try{
    const at=Date.UTC(2026,8,12,12);
    const play=await c.walletService.startQuickPlay({region:"west",anonymousSessionCredential:credential,idempotencyKey:"private-complete-1"});
    const stored=await new D1QuestionSelectionRepository(c.adapter).getAttempt(play.selection.attemptId,await deriveAnonymousSubjectHash(credential),at);
    const input={attemptId:play.selection.attemptId,anonymousSessionCredential:credential,idempotencyKey:"e".repeat(32),avatarId:"adjoa",
      answers:stored.selection.questions.map(question=>({questionStableId:question.stableId,selectedOptionIds:question.acceptedAnswers[0]}))};
    await assert.rejects(completeCowrieQuickPlay(c.adapter,{...input,anonymousSessionCredential:"b".repeat(32)},at));
    const [first,second]=await Promise.all([completeCowrieQuickPlay(c.adapter,input,at),completeCowrieQuickPlay(c.adapter,input,at)]);assert.equal(first.resultSlug,second.resultSlug);
    const row=c.database.prepare("SELECT qa.expires_at attempt,r.expires_at result FROM results r JOIN quiz_attempts qa ON qa.id=r.attempt_id").get();
    assert.equal(row.attempt,at+90*86400000);assert.equal(row.result,row.attempt);
    assert.equal(c.database.prepare("SELECT COUNT(*) n FROM answers").get().n,12);
    await assert.rejects(completeCowrieQuickPlay(c.adapter,input,row.attempt));
  }finally{c.database.close();}
});

test("scheduler reverses an expired unissued debit once, preserving allocations and purchased value",async()=>{
  const c=await setup();try{
    const at=Date.UTC(2026,8,12,12);
    for(const id of ["retention-free-1","retention-free-2"])await c.walletService.startQuickPlay({region:"west",anonymousSessionCredential:credential,idempotencyKey:id});
    const order=await c.service.startOrder(request(c));await c.service.webhook(await verified("checkout.session.completed",checkout(order)));
    c.walletRepository.commitIssuance=async()=>{throw new Error("before response");};c.walletRepository.reverseUnissued=async()=>false;
    await assert.rejects(c.walletService.startQuickPlay({region:"west",anonymousSessionCredential:credential,idempotencyKey:"retention-unissued-1"}));assert.equal(balance(c).purchased_balance,4);
    const result=await runTestRetention(c.adapter,at+86400000,50);assert.equal(result.reversals,1);assert.equal(balance(c).purchased_balance,5);
    assert.equal((await runTestRetention(c.adapter,at+86400000,50)).reversals,0);
    assert.equal(c.database.prepare("SELECT COUNT(*) n FROM cowrie_ledger WHERE entry_type='technical_reversal'").get().n,1);
  }finally{c.database.close();}
});

test("profile is exact and defaults stay off; credentialed mobile posts refuse redirects",()=>{
  assertPrivateTestFlags("off",defaultFeatureFlags);assert.throws(()=>assertPrivateTestFlags("data",defaultFeatureFlags));
  assert.equal(privateTestRuntimeReady(runtime({}),"payments"),true);
  assert.equal(privateTestRuntimeReady({...runtime({}),WYBP_NETLIFY_SITE_URL:"https://evil.invalid"},"payments"),false);
  assert.throws(()=>validateTestDatabaseId("00000000-0000-0000-0000-000000000000"));
  const options=privatePostOptions({example:true});assert.equal(options.credentials,"same-origin");assert.equal(options.mode,"cors");assert.equal(options.redirect,"error");assert.equal(options.referrerPolicy,"no-referrer");
});

test("build inputs reject runtime secrets and non-isolated database profiles",async()=>{
  const root=await mkdtemp(join(tmpdir(),"wybp-secret-free-test-"));
  try{
    await assertSecretFreeBuild(root,{});
    await assert.rejects(assertSecretFreeBuild(root,{WYBP_NETLIFY_PROXY_SECRET:"synthetic-only"}),/runtime/);
    await writeFile(join(root,".env.production"),"STRIPE_WEBHOOK_SIGNING_SECRET=whsec_synthetic_test_only\n");
    await assert.rejects(assertSecretFreeBuild(root,{}),/environment file/);
    const environment={WYBP_PRIVATE_TEST_PROFILE:"data",WYBP_TEST_D1_DATABASE_ID:"11111111-2222-4333-8444-555555555555",
      WYBP_HOSTING_ENVIRONMENT:"test",PUBLIC_APP_ORIGIN:PRIVATE_TEST.origin,WYBP_NETLIFY_PROJECT_ID:PRIVATE_TEST.projectId,
      WYBP_NETLIFY_CONTEXT:"production",WYBP_WORKER_NAME:PRIVATE_TEST.workerName,WYBP_WORKER_ORIGIN:PRIVATE_TEST.workerOrigin};
    assert.equal(releaseConfiguration(environment).profile,"data");
    assert.throws(()=>releaseConfiguration({...environment,PUBLIC_APP_ORIGIN:"https://brideprice.classesforculture.com"}));
    assert.throws(()=>releaseConfiguration({...environment,WYBP_WORKER_NAME:"afri-track-proxy"}));
    assert.throws(()=>releaseConfiguration({...environment,WYBP_TEST_D1_DATABASE_ID:"not-a-uuid"}));
  }finally{await rm(root,{recursive:true,force:true});}
});

test("D1 Royal projection matches the canonical tier at every authoritative score",async()=>{
  for(let score=0;score<=12;score++){
    const c=await setup();try{
      const at=Date.UTC(2026,8,12,12);
      const play=await c.walletService.startQuickPlay({region:"west",anonymousSessionCredential:credential,idempotencyKey:"royal-tier-boundary-1"});
      const stored=await new D1QuestionSelectionRepository(c.adapter).getAttempt(play.selection.attemptId,await deriveAnonymousSubjectHash(credential),at);
      const answers=stored.selection.questions.map((question,index)=>{
        const wrong=question.answerOptions.map(option=>[option.id]).find(selected=>!question.acceptedAnswers.some(accepted=>accepted.length===1&&accepted[0]===selected[0]));
        assert.ok(wrong,"question must permit an incorrect answer");
        return {questionStableId:question.stableId,selectedOptionIds:index<score?question.acceptedAnswers[0]:wrong};
      });
      // Real immutable completions derive every score from answers; no score enters a request.
      const completed=await completeCowrieQuickPlay(c.adapter,{attemptId:play.selection.attemptId,anonymousSessionCredential:credential,idempotencyKey:"f".repeat(32),avatarId:"adjoa",answers},at);
      const result=await c.repository.getOwnedCompletedResult(completed.resultSlug);
      assert.equal(result.score,score);
      assert.equal(result.resultTitle,RESULT_TIER_TITLES[calculateResultTier(score)],`score ${score}`);
      assert.ok(createRoyalRevealProjection({active:true,productKey:"royal_reveal_v1",resultSlug:result.publicSlug,edition:result.edition,
        score:result.score,maximumScore:result.total,resultTitle:result.resultTitle,avatarId:result.avatarId}),`score ${score}`);
    }finally{c.database.close();}
  }
});
