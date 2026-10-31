import { expect,test,type BrowserContext,type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const evidenceDir=process.env.WYBP_PRIVACY_VISUAL_DIR||"";
declare global{interface Window{__wybpPrivacyAnalyticsRequests?:string[]}}
async function harness(context:BrowserContext){await context.addInitScript(()=>{window.__wybpPrivacyAnalyticsRequests=[];const original=window.fetch.bind(window);window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{const request=input instanceof Request?input:new Request(input,init);if(new URL(request.url,location.href).pathname==="/analytics/events")window.__wybpPrivacyAnalyticsRequests?.push(typeof init?.body==="string"?init.body:"");return original(input,init);};});}
async function shot(page:Page,name:string,fullPage=false){if(evidenceDir)await page.screenshot({path:join(evidenceDir,name),fullPage});}

test.describe.configure({mode:"serial"});
test.beforeAll(async()=>{if(evidenceDir)await mkdir(evidenceDir,{recursive:true});});
test.afterAll(async({request})=>{await request.post("/__preview__/shutdown");});

test("first choice is unobstructive, equal and rejects without impairing the quiz",async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await harness(context);const page=await context.newPage();await page.goto("/?edition=west&privacy_fixture=first_visit");
  const banner=page.locator("[data-analytics-consent]");await expect(banner).toBeVisible();const allow=banner.getByRole("button",{name:"Allow analytics"});const deny=banner.getByRole("button",{name:"Do not allow"});
  const[a,b]=await Promise.all([allow.boundingBox(),deny.boundingBox()]);expect(a?.height||0).toBeGreaterThanOrEqual(44);expect(b?.height||0).toBeGreaterThanOrEqual(44);expect(Math.abs((a?.width||0)-(b?.width||0))).toBeLessThanOrEqual(1);expect(await allow.evaluate((node)=>getComputedStyle(node).backgroundColor)).toBe(await deny.evaluate((node)=>getComputedStyle(node).backgroundColor));
  expect(await page.evaluate(()=>({requests:window.__wybpPrivacyAnalyticsRequests,analytics:sessionStorage.getItem("wybp-analytics-session-v1")}))).toEqual({requests:[],analytics:null});await shot(page,"first-visit-analytics-choice.png");
  await deny.click();await expect(page.getByRole("button",{name:"Privacy choices"})).toBeVisible();await page.getByRole("button",{name:/Continue without a photo/}).click();await expect(page.locator(".hud-round")).toHaveText("Question 1 of 12");await shot(page,"analytics-rejected-quiz-works.png");await context.close();
});

test("privacy panel restores focus and allowlisted clear preserves unrelated origin data without analytics",async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await harness(context);const page=await context.newPage();await page.goto("/?edition=west");
  await page.evaluate(()=>{localStorage.setItem("wybp-region-scores",JSON.stringify({west:12}));localStorage.setItem("wybp-active-quiz-v1","owned");localStorage.setItem("wybp-analytics-consent-v1","owned");localStorage.setItem("unrelated-local","keep");sessionStorage.setItem("wybp-active-quiz-instance-v1","owned");sessionStorage.setItem("wybp-anonymous-session-v1","owned");sessionStorage.setItem("wybp-analytics-session-v1","owned");sessionStorage.setItem("wybp-analytics-seen-v1","owned");sessionStorage.setItem("wybp-royal-reveal-pending-v1","owned");sessionStorage.setItem("wybp-nomination-v1:review-scope","owned");sessionStorage.setItem("unrelated-session","keep");});
  const trigger=page.getByRole("button",{name:"Privacy choices"});await trigger.click();const dialog=page.getByRole("dialog",{name:"Privacy choices"});await expect(dialog).toBeVisible();await expect(dialog.getByRole("button",{name:"Close Privacy choices"})).toBeFocused();await shot(page,"privacy-choices-panel.png");
  await dialog.getByRole("button",{name:"Review and clear local data"}).click();await expect(dialog.getByText("Clear this application’s local data now?")).toBeVisible();await shot(page,"clear-local-data-warning.png");await dialog.getByRole("button",{name:"Yes, clear local data"}).click();await expect(dialog.getByText(/Local application data cleared/)).toBeVisible();await shot(page,"clear-local-data-completion.png");
  const state=await page.evaluate(()=>({local:[localStorage.getItem("wybp-region-scores"),localStorage.getItem("wybp-active-quiz-v1"),localStorage.getItem("wybp-analytics-consent-v1")],session:[sessionStorage.getItem("wybp-active-quiz-instance-v1"),sessionStorage.getItem("wybp-anonymous-session-v1"),sessionStorage.getItem("wybp-analytics-session-v1"),sessionStorage.getItem("wybp-analytics-seen-v1"),sessionStorage.getItem("wybp-royal-reveal-pending-v1"),sessionStorage.getItem("wybp-nomination-v1:review-scope")],unrelated:[localStorage.getItem("unrelated-local"),sessionStorage.getItem("unrelated-session")],requests:window.__wybpPrivacyAnalyticsRequests,path:location.pathname,search:location.search}));
  expect(state.local).toEqual([null,null,null]);expect(state.session).toEqual([null,null,null,null,null,null]);expect(state.unrelated).toEqual(["keep","keep"]);expect(state.requests).toEqual([]);expect(state.search).toBe("");
  await dialog.getByRole("button",{name:"Close Privacy choices"}).click();await expect(trigger).toBeFocused();await context.close();
});

test("review-only privacy fixtures cover each state and remain readable",async({page})=>{
  const scenarios:[string,string][]=[["allowed","analytics-allowed.png"],["rejected","analytics-rejected.png"],["withdrawn","analytics-withdrawn.png"],["clear_confirm","clear-confirmation-fixture.png"],["clear_complete","clear-completion-fixture.png"],["name_notice","name-notice.png"],["photo_notice","photo-notice.png"],["public_result_notice","public-result-notice.png"],["challenge_link_notice","challenge-link-notice.png"],["missing_legal_configuration","missing-legal-configuration.png"],["full_storage_notice","full-storage-notice-fixture.png"]];
  for(const[scenario,name]of scenarios){await page.goto(`/?privacy_fixture=${scenario}`);if(["allowed","rejected","withdrawn","clear_confirm","clear_complete"].includes(scenario))await expect(page.getByRole("dialog",{name:"Privacy choices"})).toBeVisible();else await expect(page.locator(`[data-privacy-review-fixture="${scenario}"]`)).toBeVisible();await shot(page,name);}
});

test("legal routes, mobile, zoom, focus and reduced motion have no horizontal overflow",async({browser})=>{
  const legal:[string,string][]=[["/privacy","privacy-notice.png"],["/privacy/storage","storage-notice.png"],["/terms","terms.png"],["/community-standards","community-standards.png"],["/privacy/retention","retention-schedule.png"],["/privacy/requests","privacy-requests.png"]];
  const desktop=await browser.newContext({viewport:{width:1100,height:800}});const legalPage=await desktop.newPage();for(const[path,name]of legal){await legalPage.goto(path);const deny=legalPage.locator("[data-analytics-consent]").getByRole("button",{name:"Do not allow"});if(await deny.isVisible())await deny.click();expect(await legalPage.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await shot(legalPage,name,true);}await desktop.close();
  const mobile=await browser.newContext({viewport:{width:320,height:700},isMobile:true,hasTouch:true,reducedMotion:"reduce"});const page=await mobile.newPage();await page.goto("/?privacy_fixture=mobile_320");expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await shot(page,"mobile-320.png");await page.goto("/?privacy_fixture=reduced_motion");await shot(page,"reduced-motion.png");await mobile.close();
  const zoom=await browser.newContext({viewport:{width:390,height:900},deviceScaleFactor:2,reducedMotion:"reduce"});const zoomPage=await zoom.newPage();await zoomPage.goto("/?privacy_fixture=zoom_200");expect(await zoomPage.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await zoomPage.getByRole("button",{name:"Privacy choices"}).focus();expect(await zoomPage.getByRole("button",{name:"Privacy choices"}).evaluate((node)=>getComputedStyle(node).outlineStyle)).not.toBe("none");await shot(zoomPage,"zoom-200-keyboard-focus.png");await zoom.close();
});
