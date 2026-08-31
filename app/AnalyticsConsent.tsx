"use client";

/* eslint-disable react-hooks/set-state-in-effect -- versioned browser preference hydration intentionally synchronises UI state */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENT_SCHEMA_VERSION, type AnalyticsEventName } from "../db/analyticsContracts.ts";
import { ANALYTICS_NOTICE_VERSION, type AnalyticsClientEvent, type AnalyticsProperties } from "../db/analytics.ts";
import { installAnalyticsAdapters } from "./analyticsAdapter.ts";
import {
  clearAnalyticsSession, getOrCreateAnalyticsSession, readAnalyticsConsentPreference,
  readSeenAnalyticsKeys, rememberSeenAnalyticsKey, writeAnalyticsConsentPreference,
} from "./analyticsPreference.ts";
import type { LocalAnalyticsEvent } from "./analyticsLocal.ts";
import { activeFeatureFlags } from "./featureFlags.ts";
import { clearApplicationLocalData, PRIVACY_CLEAR_EVENT } from "./storageInventory.ts";

declare const __WYBP_REVIEW_PRIVACY_FIXTURES__: boolean | undefined;
type Choice = "unknown" | "accepted" | "rejected";
type ReviewScenario = "first_visit" | "allowed" | "rejected" | "withdrawn" | "panel" | "clear_confirm" | "clear_complete" | "name_notice" | "photo_notice" | "public_result_notice" | "challenge_link_notice" | "missing_legal_configuration" | "full_storage_notice" | "mobile_320" | "zoom_200" | "reduced_motion";
const reviewEnabled = typeof __WYBP_REVIEW_PRIVACY_FIXTURES__ === "boolean" && __WYBP_REVIEW_PRIVACY_FIXTURES__;
const fixtureNotices:Partial<Record<ReviewScenario,Readonly<{title:string;copy:string;href?:string}>>>=Object.freeze({
  name_notice:{title:"Display-name notice",copy:"A display name stays in this tab and local media unless you deliberately create a challenge. Published results use A challenger."},
  photo_notice:{title:"Private-photograph notice",copy:"The re-encoded photo remains in browser memory for up to 30 minutes, can appear in a chosen static portrait, is removable, and is never uploaded or used in public results or Story video."},
  public_result_notice:{title:"Public-result notice",copy:"Publishing creates a public link that expires 90 days after quiz completion. Publishing never restarts expiry; unpublication or deletion may end access sooner, while external caches or copies may persist."},
  challenge_link_notice:{title:"Challenge-link notice",copy:"Anyone with a challenge link may open it while active. It expires at the server timestamp, no later than 30 days or the source result, and valid revocation may end it sooner."},
  missing_legal_configuration:{title:"Missing legal configuration",copy:"Controller and contact details are deliberately absent, so legal pages remain visibly unapproved and excluded from indexing.",href:"/privacy"},
  full_storage_notice:{title:"Full storage notice",copy:"Review the human-readable notice generated from the canonical machine inventory.",href:"/privacy/storage"},
  mobile_320:{title:"320-pixel review",copy:"Review the persistent control, dialog and legal routes at a 320-pixel viewport."},
  zoom_200:{title:"200 percent zoom review",copy:"Review reflow, focus visibility and the no-horizontal-overflow boundary at 200 percent zoom."},
  reduced_motion:{title:"Reduced-motion review",copy:"Review the same controls with animation and transitions suppressed."},
});

function reviewScenario(): ReviewScenario | null {
  if (!reviewEnabled || typeof location === "undefined") return null;
  const value = new URLSearchParams(location.search).get("privacy_fixture");
  return ["first_visit","allowed","rejected","withdrawn","panel","clear_confirm","clear_complete","name_notice","photo_notice","public_result_notice","challenge_link_notice","missing_legal_configuration","full_storage_notice","mobile_320","zoom_200","reduced_motion"].includes(value || "") ? value as ReviewScenario : null;
}
function uuidV4(): string { return crypto.randomUUID().toLowerCase(); }
function event(name: AnalyticsEventName, properties: AnalyticsProperties = {}, referralChallengeCode?: string): AnalyticsClientEvent {
  return Object.freeze({ name, eventSchemaVersion: ANALYTICS_EVENT_SCHEMA_VERSION, consentNoticeVersion: ANALYTICS_NOTICE_VERSION, clientEventUuid: uuidV4(), occurredAt: Date.now(), properties, ...(referralChallengeCode ? { referralChallengeCode } : {}) });
}
async function postAnalytics(body: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await fetch("/analytics/events", { method:"POST",mode:"same-origin",credentials:"omit",keepalive:true,referrerPolicy:"no-referrer",headers:{"content-type":"application/json"},body:JSON.stringify(body) });
    return response.ok;
  } catch { return false; }
}

export default function AnalyticsConsent() {
  const [choice,setChoice]=useState<Choice>("unknown");
  const [manageOpen,setManageOpen]=useState(false);
  const [confirmClear,setConfirmClear]=useState(false);
  const [announcement,setAnnouncement]=useState("");
  const [fixture,setFixture]=useState<ReviewScenario|null>(null);
  const sessionCredential=useRef<string|null>(null);
  const queue=useRef<AnalyticsClientEvent[]>([]);
  const flushing=useRef(false);
  const seen=useRef(new Set<string>());
  const initialTriggerRef=useRef<HTMLButtonElement>(null);
  const floatingTriggerRef=useRef<HTMLButtonElement>(null);
  const dialogRef=useRef<HTMLDivElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);

  useEffect(()=>{
    const scenario=reviewScenario();setFixture(scenario);
    if(scenario){
      if(scenario==="allowed")setChoice("accepted");else if(["rejected","withdrawn"].includes(scenario))setChoice("rejected");else setChoice("unknown");
      if(["panel","clear_confirm","clear_complete","allowed","rejected","withdrawn"].includes(scenario))setManageOpen(true);
      if(scenario==="clear_confirm")setConfirmClear(true);
      if(scenario==="clear_complete")setAnnouncement("Local application data cleared. Analytics is inactive until you choose Allow.");
      return;
    }
    if(!activeFeatureFlags.first_party_analytics)return;
    const preference=readAnalyticsConsentPreference(localStorage);
    if(preference?.choice==="accepted"){
      const session=getOrCreateAnalyticsSession(sessionStorage,crypto);sessionCredential.current=session.credential;seen.current=readSeenAnalyticsKeys(sessionStorage);setChoice("accepted");
    }else if(preference?.choice==="rejected"||(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl===true)setChoice("rejected");
  },[]);

  useEffect(()=>{
    if(!activeFeatureFlags.first_party_analytics||choice!=="accepted"||fixture)return;
    const flush=async()=>{if(flushing.current||!sessionCredential.current||queue.current.length===0)return;flushing.current=true;const batch=queue.current.splice(0,10);const ok=await postAnalytics({action:"events",analyticsSessionCredential:sessionCredential.current,events:batch});if(!ok)queue.current.length=0;flushing.current=false;if(queue.current.length)void flush();};
    const emit=(local:LocalAnalyticsEvent)=>{if(local.dedupeKey&&seen.current.has(local.dedupeKey))return;if(local.dedupeKey)rememberSeenAnalyticsKey(sessionStorage,seen.current,local.dedupeKey);queue.current.push(event(local.name,local.properties||{},local.referralChallengeCode));if(queue.current.length>10)queue.current.shift();queueMicrotask(()=>void flush());};
    const uninstall=installAnalyticsAdapters(emit);const match=location.pathname.match(/^\/challenge\/([0-9a-f]{48})$/);if(match&&document.querySelector("[data-challenge-active]"))emit({name:"referred_visit",properties:{surface:"challenge_landing",source:"challenge",campaign:"challenge",referred:true},referralChallengeCode:match[1],dedupeKey:"referred_visit"});return uninstall;
  },[choice,fixture]);

  useEffect(()=>{
    if(!manageOpen)return;
    closeRef.current?.focus({preventScroll:true});
    const keydown=(keyboardEvent:KeyboardEvent)=>{
      if(keyboardEvent.key==="Escape"){keyboardEvent.preventDefault();setManageOpen(false);setConfirmClear(false);queueMicrotask(()=>(choice==="unknown"?initialTriggerRef:floatingTriggerRef).current?.focus());return;}
      if(keyboardEvent.key!=="Tab"||!dialogRef.current)return;
      const controls=[...dialogRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      if(!controls.length)return;const first=controls[0];const last=controls[controls.length-1];if(keyboardEvent.shiftKey&&document.activeElement===first){keyboardEvent.preventDefault();last.focus();}else if(!keyboardEvent.shiftKey&&document.activeElement===last){keyboardEvent.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",keydown);return()=>document.removeEventListener("keydown",keydown);
  },[choice,manageOpen]);

  const close=()=>{setManageOpen(false);setConfirmClear(false);queueMicrotask(()=>(choice==="unknown"?initialTriggerRef:floatingTriggerRef).current?.focus());};
  const accept=async()=>{
    if(fixture){setChoice("accepted");setAnnouncement("Optional analytics allowed in this synthetic review fixture. No analytics request was sent.");return;}
    if(!activeFeatureFlags.first_party_analytics){setAnnouncement("Optional analytics is not active in this build.");return;}
    const now=Date.now();writeAnalyticsConsentPreference(localStorage,"accepted",now);const session=getOrCreateAnalyticsSession(sessionStorage,crypto,now);sessionCredential.current=session.credential;seen.current=readSeenAnalyticsKeys(sessionStorage);setChoice("accepted");setAnnouncement("Optional analytics allowed. You can withdraw immediately from Privacy choices.");
    const accepted=await postAnalytics({action:"accept",analyticsSessionCredential:session.credential,event:event("consent_accept")});if(accepted)await postAnalytics({action:"events",analyticsSessionCredential:session.credential,events:[event("app_visit",{surface:"entry",source:"direct",referred:false})]});
  };
  const reject=()=>{
    if(fixture){setChoice("rejected");setAnnouncement("Optional analytics not allowed in this synthetic review fixture. No analytics request was sent.");return;}
    const credential=sessionCredential.current;queue.current.length=0;sessionCredential.current=null;clearAnalyticsSession(sessionStorage);writeAnalyticsConsentPreference(localStorage,"rejected");setChoice("rejected");setAnnouncement(choice==="accepted"?"Analytics consent withdrawn. Collection stopped immediately; the quiz still works normally.":"Optional analytics not allowed. The quiz still works normally.");if(credential)void postAnalytics({action:"withdraw",analyticsSessionCredential:credential});
  };
  const clearLocal=()=>{
    queue.current.length=0;sessionCredential.current=null;seen.current.clear();
    const result=clearApplicationLocalData(localStorage,sessionStorage);
    try{history.replaceState({},"",location.pathname);}catch{/* current route remains safe */}
    window.dispatchEvent(new CustomEvent(PRIVACY_CLEAR_EVENT,{detail:{removedCount:result.removed.length}}));
    setChoice("unknown");setConfirmClear(false);setAnnouncement("Local application data cleared. In-memory photos and generated media were released where open. Analytics is inactive until you choose Allow again. Downloaded files and server-held records were not deleted.");
  };
  const analyticsControlsAvailable=activeFeatureFlags.first_party_analytics||Boolean(fixture);
  const showInitial=analyticsControlsAvailable&&choice==="unknown"&&!manageOpen;
  const fixtureNotice=fixture?fixtureNotices[fixture]:undefined;

  return <>
    {announcement&&<div className="privacy-announcement sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>}
    {showInitial&&<section className="analytics-consent" aria-labelledby="analytics-consent-title" data-analytics-consent data-choice={choice}>
      <div className="analytics-consent-copy"><p className="analytics-consent-kicker">Optional first-party analytics</p><h2 id="analytics-consent-title">Help improve the game?</h2><p>Allowlisted first-party measurement can record visits, quiz progress, challenge use and successful browser handoffs. The quiz works fully without it. No names, photographs, answers, advertising identifiers or cross-site tracking.</p><p>Raw events expire within 30 days. You can withdraw as easily as you allow.</p></div>
      <div className="analytics-consent-actions" aria-label="Analytics preference"><button type="button" className="analytics-consent-choice" onClick={()=>void accept()}>Allow analytics</button><button type="button" className="analytics-consent-choice" onClick={reject}>Do not allow</button><button ref={initialTriggerRef} type="button" className="analytics-consent-manage" onClick={()=>setManageOpen(true)} aria-haspopup="dialog">Privacy choices</button></div>
    </section>}
    {fixtureNotice&&<aside className="privacy-review-fixture" data-privacy-review-fixture={fixture||undefined} role="note"><strong>{fixtureNotice.title}</strong><p>{fixtureNotice.copy}</p>{fixtureNotice.href&&<Link href={fixtureNotice.href}>Open review route</Link>}</aside>}
    <button ref={floatingTriggerRef} type="button" className="privacy-choices-trigger" onClick={()=>setManageOpen(true)} aria-haspopup="dialog" hidden={showInitial}>Privacy choices</button>
    {manageOpen&&<div className="privacy-dialog-backdrop" role="presentation" onMouseDown={(mouseEvent)=>{if(mouseEvent.target===mouseEvent.currentTarget)close();}} data-privacy-fixture={fixture||undefined}>
      <div ref={dialogRef} className="privacy-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-dialog-title" aria-describedby="privacy-dialog-summary">
        <header><div><p>Your controls</p><h2 id="privacy-dialog-title">Privacy choices</h2></div><button ref={closeRef} type="button" onClick={close} aria-label="Close Privacy choices">×</button></header>
        <p id="privacy-dialog-summary">Required browser storage supports features you request. Optional first-party analytics is separate, off until affirmative consent, and never required for the quiz.</p>
        <section aria-labelledby="required-storage-title"><h3 id="required-storage-title">Required functionality</h3><p>Quiz recovery, tab-scoped anonymous ownership, deliberate nomination state and payment-return state are used only for their requested functions. They are never repurposed for advertising or marketing.</p></section>
        <section aria-labelledby="optional-analytics-title"><h3 id="optional-analytics-title">Optional first-party analytics</h3><p data-current-analytics-choice>Current choice: <strong>{!analyticsControlsAvailable?"Not active in this build":choice==="accepted"?"Allowed":choice==="rejected"?"Not allowed":"No choice yet"}</strong></p><p>When allowed, controlled event names and coarse product fields may be sent first party. There is no advertising, cross-site tracking, individual profiling, third-party analytics, pixel, tag or marketing consent.</p><div className="privacy-equal-choices"><button type="button" onClick={()=>void accept()} disabled={!analyticsControlsAvailable}>Allow analytics</button><button type="button" onClick={reject} disabled={!analyticsControlsAvailable}>Do not allow</button></div></section>
        <section className="privacy-clear" aria-labelledby="privacy-clear-title"><h3 id="privacy-clear-title">Clear my local data</h3><p>Clears only this application’s allowlisted quiz recovery, best scores, anonymous and analytics credentials, analytics choice, nomination state and pending-order reference. It also asks open game surfaces to release names, photographs and generated-media references.</p><p>It cannot delete downloaded files, public results, challenges, orders, entitlements or third-party copies. Server-held requests use separate ownership checks.</p>{confirmClear?<div className="privacy-clear-confirm" role="alert"><strong>Clear this application’s local data now?</strong><div><button type="button" onClick={clearLocal}>Yes, clear local data</button><button type="button" onClick={()=>setConfirmClear(false)}>Cancel</button></div></div>:<button type="button" onClick={()=>setConfirmClear(true)}>Review and clear local data</button>}</section>
        {announcement&&<p className="privacy-visible-status" role="status">{announcement}</p>}
        <nav aria-label="Full privacy information"><Link href="/privacy">Privacy Notice</Link><Link href="/privacy/storage">Cookie and Local Storage Notice</Link><Link href="/privacy/requests">Privacy requests</Link></nav>
      </div>
    </div>}
    <footer className="site-legal-footer"><p>A playful culture score, never a measure of human worth.</p><nav aria-label="Legal and privacy"><Link href="/privacy">Privacy</Link><Link href="/privacy/storage">Storage</Link><Link href="/terms">Terms</Link><Link href="/community-standards">Community standards</Link><Link href="/privacy/retention">Retention</Link><Link href="/privacy/requests">Privacy requests</Link></nav><small>Draft technical compliance wording. Not professionally approved or activated for production.</small></footer>
  </>;
}
