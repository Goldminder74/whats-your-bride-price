import assert from "node:assert/strict";
import { readFile,mkdtemp,rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve,join } from "node:path";
import { tmpdir } from "node:os";
import { createHmac } from "node:crypto";
import { Miniflare } from "miniflare";
import { SignJWT } from "jose";
import { chromium,webkit,expect } from "@playwright/test";
import { PRIVATE_TEST } from "../app/privateTestProfile.ts";
import { verifyRelease } from "../scripts/netlify-release.mjs";
import { loadMigrationPlan } from "../scripts/data-migrations.mjs";
import { loadEvidence,seedPlan,regionPlan,regions } from "../scripts/private-test-catalogue.mjs";
import { config } from "./helpers/cowrieCommerce.mjs";
import { cowrieProductKeys,cowrieProducts } from "../db/cowrieProducts.ts";
import { privateProxy } from "./helpers/privateProxy.mjs";

const pointer=JSON.parse(await readFile("outputs/netlify-worker/latest.json","utf8"));
const manifest=await verifyRelease(pointer.directory);
assert.equal(manifest.configuration.profile,"payments");assert.equal(manifest.configuration.databaseId,"11111111-2222-4333-8444-555555555555");
const workerConfig=JSON.parse(await readFile(resolve(pointer.directory,"wrangler.json"),"utf8"));
const secret="synthetic-local-runtime-canary-"+"x".repeat(40);
const bindings={...workerConfig.vars,WYBP_NETLIFY_PROXY_SECRET:secret,WYBP_TEST_WEBHOOK_ENABLED:"true",WYBP_TEST_RETENTION_ENABLED:"true",
  STRIPE_EXPECTED_LIVEMODE:"false",STRIPE_PAYMENT_LINK_URL:config.publicPaymentLinkUrl,STRIPE_PAYMENT_LINK_ID:config.expectedPaymentLinkId,
  STRIPE_WEBHOOK_SIGNING_SECRET:config.webhookSigningSecret,ROYAL_REVEAL_PRODUCT_KEY:config.expectedProductKey,ROYAL_REVEAL_AMOUNT_MINOR:199,ROYAL_REVEAL_CURRENCY:"GBP"};
for(const key of cowrieProductKeys){const p=key.toUpperCase(),v=cowrieProducts[key];Object.assign(bindings,{[`${p}_PAYMENT_LINK_URL`]:config.cowrieBundles[key].publicPaymentLinkUrl,[`${p}_PAYMENT_LINK_ID`]:config.cowrieBundles[key].expectedPaymentLinkId,[`${p}_PRODUCT_KEY`]:key,[`${p}_QUANTITY`]:v.quantity,[`${p}_AMOUNT_MINOR`]:v.amountMinor,[`${p}_CURRENCY`] :"GBP",[`${p}_LIVEMODE`]:"false"});}
const serverPaths=Object.keys(manifest.files).filter(path=>path.startsWith("server/")).sort((a,b)=>a==="server/index.js"?-1:b==="server/index.js"?1:a.localeCompare(b));
const mf=new Miniflare({name:PRIVATE_TEST.workerName,modules:serverPaths.map(path=>({type:"ESModule",path:resolve(pointer.directory,path)})),modulesRoot:resolve(pointer.directory,"server"),
  compatibilityDate:workerConfig.compatibility_date,compatibilityFlags:workerConfig.compatibility_flags,images:{binding:"IMAGES"},
  bindings,d1Databases:{DB:manifest.configuration.databaseId},assets:{directory:resolve(pointer.directory,"client"),binding:"ASSETS",routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}},
  outboundService:()=>{throw new Error("Hosted services prohibited in local test");}});
const evidence=await mkdtemp(join(tmpdir(),"wybp-compiled-test-evidence-"));
const origin=PRIVATE_TEST.origin;
let signedCount=0;
async function proxy(path,init={}){
  signedCount++;
  const signature=await new SignJWT({iss:"netlify",exp:Math.floor(Date.now()/1000)+60,netlify_id:PRIVATE_TEST.projectId,deploy_context:"production",site_url:origin})
    .setProtectedHeader({alg:"HS256"}).sign(new TextEncoder().encode(secret));
  return mf.dispatchFetch(PRIVATE_TEST.workerOrigin+path,{...init,redirect:"manual",headers:{...init.headers,"x-nf-sign":signature}});
}
try{
  const db=await mf.getD1Database("DB");
  for(const migration of await loadMigrationPlan())await db.batch(migration.statements.map(sql=>db.prepare(sql)));
  await promisify(execFile)(process.execPath,["scripts/build-machine-evidence-question-bank.mjs","--output",evidence],{windowsHide:true});
  const catalogue=await loadEvidence(evidence);
  const batch=rows=>db.batch(rows.map(row=>db.prepare(row.sql).bind(...row.params)));
  await batch(seedPlan(catalogue.seed));for(const region of regions){await batch(regionPlan("import",region,catalogue));await batch(regionPlan("publish",region,catalogue));}
  for(const path of ["/","/cowries/play","/commerce/orders","/owner/questions","/favicon.ico","/quiz-art/food-1.svg"]){const response=await mf.dispatchFetch(PRIVATE_TEST.workerOrigin+path);assert.equal(response.status,404,`${path}: ${await response.text()}`);}
  assert.equal((await proxy("/favicon.ico")).status,200);
  const postHeaders={origin,"sec-fetch-site":"same-origin","sec-fetch-mode":"cors","content-type":"application/json"};
  assert.equal((await proxy("/cowries/wallet",{method:"POST",headers:{...postHeaders,origin:"https://evil.invalid"},body:"{}"})).status,403);
  const webhookPath="/commerce/stripe-test-webhook";
  const eventBody=JSON.stringify({id:"evt_local_live_rejected",livemode:true,type:"checkout.session.completed",data:{object:{}}});
  const timestamp=Math.floor(Date.now()/1000);const signature=`t=${timestamp},v1=${createHmac("sha256",config.webhookSigningSecret).update(`${timestamp}.${eventBody}`).digest("hex")}`;
  assert.equal((await mf.dispatchFetch(PRIVATE_TEST.workerOrigin+webhookPath,{method:"POST",headers:{"content-type":"application/json","stripe-signature":signature},body:eventBody})).status,400);
  assert.equal((await mf.dispatchFetch(PRIVATE_TEST.workerOrigin+webhookPath)).status,404);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM stripe_webhook_events").first()).n,0);
  for(const [browserType,options] of [[chromium,{viewport:{width:1366,height:900},channel:process.platform==="win32"?"msedge":undefined}],[webkit,{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3}]].filter(([type])=>!process.env.WYBP_TEST_BROWSER||type.name()===process.env.WYBP_TEST_BROWSER)){
    const {channel,...contextOptions}=options;
    let checkoutReference,failCompletion=true;
    const posts=[];
    const local=await privateProxy([new URL(origin).hostname,"buy.stripe.com"],async request=>{
      const url=new URL(request.url);
      if(url.hostname==="buy.stripe.com"){checkoutReference=url.searchParams.get("client_reference_id");return new Response("<p>Local checkout simulation; no Stripe contact.</p>",{headers:{"content-type":"text/html"}});}
      assert.match(request.headers.get("cookie")||"",/compiled_private_access=local-only/);
      if(request.method==="POST"){
        assert.equal(request.headers.get("origin"),origin);assert.equal(request.headers.get("sec-fetch-site"),"same-origin");assert.equal(request.headers.get("sec-fetch-mode"),"cors");posts.push(url.pathname);
        if(url.pathname==="/cowries/complete"&&failCompletion){failCompletion=false;return Response.json({completed:false},{status:503});}
      }
      return proxy(url.pathname+url.search,{method:request.method,headers:Object.fromEntries(request.headers),body:request.method==="POST"?Buffer.from(await request.arrayBuffer()):undefined});
    });
    const browser=await browserType.launch({headless:true,proxy:{server:local.server},...(channel?{channel}:{})});
    try{
      const context=await browser.newContext({...contextOptions,ignoreHTTPSErrors:true,reducedMotion:"reduce",serviceWorkers:"block"});
      await context.addCookies([{name:"compiled_private_access",value:"local-only",url:origin,httpOnly:true,secure:true,sameSite:"Lax"}]);
      const page=await context.newPage();const errors=[];
      page.setDefaultNavigationTimeout(30000);
      page.setDefaultTimeout(30000);
      page.on("pageerror",error=>errors.push(error.message));
      const failures=[];page.on("requestfailed",request=>failures.push({path:new URL(request.url()).pathname,error:request.failure()?.errorText}));
      await page.goto(origin+"/?edition=west");
      try { await page.locator("main[data-hydrated='true']").waitFor(); }
      catch(error){console.error(JSON.stringify({errors,failures,proxyErrors:local.errors.map(error=>error.message),body:(await page.locator("body").innerText()).slice(0,150)}));throw error;}
      await page.getByRole("button",{name:/Cowries/}).click();await page.getByRole("button",{name:"Create wallet",exact:true}).click();
      await expect(page.getByText("Wallet created. Save the recovery credential now; it will not be shown again.")).toBeVisible();
      await page.getByRole("button",{name:"Close Cowrie Wallet"}).click();
      await page.getByRole("button",{name:"Start a fresh regional game"}).click();
      for(let number=1;number<=12;number++){
        await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow",String(number));
        await page.locator(".answer-grid > button").first().click();
        const lock=page.getByRole("button",{name:/Lock in/});if(await lock.count()){for(const button of (await page.locator(".answer-grid > button").all()).slice(1,3))await button.click();await lock.click();}
        await page.locator(".answer-reveal").getByRole("button").last().click();
        if(number<12){await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow",String(number+1));if(number%3===0)await page.getByRole("button",{name:/Claim gem/}).click();}
      }
      await expect(page.getByRole("button",{name:"Retry saving result"})).toBeVisible();await page.getByRole("button",{name:"Retry saving result"}).click();
      await expect(page.getByRole("button",{name:"Retry saving result"})).toHaveCount(0);
      await expect(page.getByRole("button",{name:"Unlock for £1.99"})).toBeVisible();
      await page.locator(".royal-delivery-consent input").check();await page.getByRole("button",{name:"Unlock for £1.99"}).click();
      try { await page.waitForURL("https://buy.stripe.com/**"); }
      catch(error){console.error(JSON.stringify({browser:browserType.name(),errors,proxyErrors:local.errors.map(error=>error.message),posts,offerError:await page.locator(".royal-offer-error").allTextContents()}));throw error;}
      assert.match(checkoutReference,/^rr_[0-9a-f]{32}$/);
      const paidBody=JSON.stringify({id:`evt_local_royal_${browserType.name()}`,type:"checkout.session.completed",livemode:false,data:{object:{
        id:`cs_local_royal_${browserType.name()}`,client_reference_id:checkoutReference,payment_link:config.expectedPaymentLinkId,
        payment_intent:`pi_local_royal_${browserType.name()}`,amount_total:199,currency:"gbp",mode:"payment",payment_status:"paid"}}});
      const at=Math.floor(Date.now()/1000),sig=`t=${at},v1=${createHmac("sha256",config.webhookSigningSecret).update(`${at}.${paidBody}`).digest("hex")}`;
      for(let repeat=0;repeat<2;repeat++)assert.equal((await mf.dispatchFetch(PRIVATE_TEST.workerOrigin+webhookPath,{method:"POST",headers:{"content-type":"application/json","stripe-signature":sig},body:paidBody})).status,200);
      await page.goto(origin+"/royal-reveal/return?paid=1");await expect(page.getByRole("heading",{name:"Your Royal Reveal Pack",exact:true})).toBeVisible();
      await page.goto(origin+"/privacy");await page.getByRole("link",{name:"Return to the game"}).click();await page.locator("main[data-hydrated='true']").waitFor();
      await page.goBack();await page.getByRole("heading",{name:"Privacy Notice",exact:true}).waitFor();await page.goForward();await page.locator("main[data-hydrated='true']").waitFor();await page.reload();await page.locator("main[data-hydrated='true']").waitFor();
      for(const key of cowrieProductKeys){
        await page.getByRole("button",{name:/Cowries/}).click();await page.getByRole("heading",{name:"One-off Cowrie bundles",exact:true}).waitFor();
        await page.locator(`#bundle-${key}`).check();await page.locator(".cowrie-delivery-consent input").check();
        await page.getByRole("button",{name:`Continue to Stripe · ${cowrieProducts[key].displayPrice}`,exact:true}).click();await page.waitForURL("https://buy.stripe.com/**");
        const body=JSON.stringify({id:`evt_local_${key}_${browserType.name()}`,type:"checkout.session.completed",livemode:false,data:{object:{id:`cs_local_${key}_${browserType.name()}`,
          client_reference_id:checkoutReference,payment_link:config.cowrieBundles[key].expectedPaymentLinkId,payment_intent:`pi_local_${key}_${browserType.name()}`,
          amount_total:cowrieProducts[key].amountMinor,currency:"gbp",mode:"payment",payment_status:"paid"}}});
        const t=Math.floor(Date.now()/1000),signed=`t=${t},v1=${createHmac("sha256",config.webhookSigningSecret).update(`${t}.${body}`).digest("hex")}`;
        for(let repeat=0;repeat<2;repeat++)assert.equal((await mf.dispatchFetch(PRIVATE_TEST.workerOrigin+webhookPath,{method:"POST",headers:{"content-type":"application/json","stripe-signature":signed},body})).status,200);
        await page.goto(origin+"/cowries/return?paid=1");await expect(page.getByText(`${cowrieProducts[key].quantity} purchased Cowries were credited only after verified payment.`,{exact:true})).toBeVisible();
        await page.goto(origin+"/?edition=west");await page.locator("main[data-hydrated='true']").waitFor();
      }
      assert.ok(posts.includes("/cowries/wallet"));assert.ok(posts.includes("/cowries/play"));assert.ok(posts.includes("/questions/answer"));assert.ok(posts.filter(path=>path==="/cowries/complete").length>=2);
      assert.deepEqual(errors,[]);assert.deepEqual(local.errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
      await context.close();
    }finally{await browser.close();await local.close();}
  }
  for(const [path,hash] of Object.entries(manifest.files)){void hash;const bytes=await readFile(resolve(pointer.directory,path));assert.ok(!bytes.includes(Buffer.from(secret)));assert.ok(!bytes.includes(Buffer.from(config.webhookSigningSecret)));}
  assert.ok(signedCount>30);
  const worker=await mf.getWorker();await worker.scheduled({scheduledTime:Date.now(),cron:"*/15 * * * *"});
  console.log("PASS: compiled private payments profile, real local D1, protected assets, exact webhook isolation, desktop/WebKit cookie+Origin, authoritative twelve-answer result with retry and RSC navigation. No hosted changes.");
}finally{await mf.dispose();await rm(evidence,{recursive:true,force:true});}
