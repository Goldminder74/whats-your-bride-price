"use client";

/* eslint-disable react-hooks/set-state-in-effect -- consent preference hydration intentionally synchronises browser storage into UI state */

import { useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENT_SCHEMA_VERSION, type ActiveAnalyticsEventName } from "../db/analyticsContracts.ts";
import { ANALYTICS_NOTICE_VERSION, type AnalyticsClientEvent, type AnalyticsProperties } from "../db/analytics.ts";
import { installAnalyticsAdapters } from "./analyticsAdapter.ts";
import {
  clearAnalyticsSession, getOrCreateAnalyticsSession, readAnalyticsConsentPreference,
  readSeenAnalyticsKeys, rememberSeenAnalyticsKey, writeAnalyticsConsentPreference,
} from "./analyticsPreference.ts";
import type { LocalAnalyticsEvent } from "./analyticsLocal.ts";
import { activeFeatureFlags } from "./featureFlags.ts";

type Choice = "unknown" | "accepted" | "rejected";

function uuidV4(): string { return crypto.randomUUID().toLowerCase(); }
function event(name: ActiveAnalyticsEventName, properties: AnalyticsProperties = {}, referralChallengeCode?: string): AnalyticsClientEvent {
  return Object.freeze({ name, eventSchemaVersion: ANALYTICS_EVENT_SCHEMA_VERSION, consentNoticeVersion: ANALYTICS_NOTICE_VERSION, clientEventUuid: uuidV4(), occurredAt: Date.now(), properties, ...(referralChallengeCode ? { referralChallengeCode } : {}) });
}

async function postAnalytics(body: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await fetch("/analytics/events", { method: "POST", mode: "same-origin", credentials: "omit", keepalive: true, referrerPolicy: "no-referrer", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return response.ok;
  } catch { return false; }
}

export default function AnalyticsConsent() {
  const [choice, setChoice] = useState<Choice>("unknown");
  const [manageOpen, setManageOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const sessionCredential = useRef<string | null>(null);
  const queue = useRef<AnalyticsClientEvent[]>([]);
  const flushing = useRef(false);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!activeFeatureFlags.first_party_analytics) return;
    const preference = readAnalyticsConsentPreference(localStorage);
    if (preference?.choice === "accepted") {
      const session = getOrCreateAnalyticsSession(sessionStorage, crypto);
      sessionCredential.current = session.credential; seen.current = readSeenAnalyticsKeys(sessionStorage); setChoice("accepted");
    } else if (preference?.choice === "rejected" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true) setChoice("rejected");
    else setChoice("unknown");
  }, []);

  useEffect(() => {
    if (!activeFeatureFlags.first_party_analytics || choice !== "accepted") return;
    const flush = async () => {
      if (flushing.current || !sessionCredential.current || queue.current.length === 0) return;
      flushing.current = true;
      const batch = queue.current.splice(0, 10);
      const ok = await postAnalytics({ action: "events", analyticsSessionCredential: sessionCredential.current, events: batch });
      if (!ok) queue.current.length = 0;
      flushing.current = false;
      if (queue.current.length) void flush();
    };
    const emit = (local: LocalAnalyticsEvent) => {
      if (local.dedupeKey && seen.current.has(local.dedupeKey)) return;
      if (local.dedupeKey) rememberSeenAnalyticsKey(sessionStorage, seen.current, local.dedupeKey);
      queue.current.push(event(local.name, local.properties || {}, local.referralChallengeCode));
      if (queue.current.length > 10) queue.current.shift();
      queueMicrotask(() => void flush());
    };
    const uninstall = installAnalyticsAdapters(emit);
    const match = location.pathname.match(/^\/challenge\/([0-9a-f]{48})$/);
    if (match && document.querySelector("[data-challenge-active]")) emit({ name: "referred_visit", properties: { surface: "challenge_landing", source: "challenge", campaign: "challenge", referred: true }, referralChallengeCode: match[1], dedupeKey: "referred_visit" });
    return uninstall;
  }, [choice]);

  if (!activeFeatureFlags.first_party_analytics) return null;

  const accept = async () => {
    const now = Date.now(); writeAnalyticsConsentPreference(localStorage, "accepted", now);
    const session = getOrCreateAnalyticsSession(sessionStorage, crypto, now); sessionCredential.current = session.credential; seen.current = readSeenAnalyticsKeys(sessionStorage);
    setChoice("accepted"); setManageOpen(false); setAnnouncement("Optional analytics accepted. You can change this later.");
    const accepted = await postAnalytics({ action: "accept", analyticsSessionCredential: session.credential, event: event("consent_accept") });
    if (accepted) await postAnalytics({ action: "events", analyticsSessionCredential: session.credential, events: [event("app_visit", { surface: "entry", source: "direct", referred: false })] });
  };
  const reject = () => {
    const credential = sessionCredential.current;
    queue.current.length = 0; sessionCredential.current = null; clearAnalyticsSession(sessionStorage);
    writeAnalyticsConsentPreference(localStorage, "rejected"); setChoice("rejected"); setManageOpen(false);
    setAnnouncement(choice === "accepted" ? "Analytics consent withdrawn. The quiz still works normally." : "Optional analytics rejected. The quiz still works normally.");
    if (credential) void postAnalytics({ action: "withdraw", analyticsSessionCredential: credential });
  };
  const showPanel = choice === "unknown" || manageOpen;

  return <>
    <div className="analytics-consent-status sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
    {showPanel ? <section className="analytics-consent" aria-labelledby="analytics-consent-title" data-analytics-consent data-choice={choice}>
      <div className="analytics-consent-copy">
        <p className="analytics-consent-kicker">Your privacy choice</p>
        <h2 id="analytics-consent-title">Help improve the game?</h2>
        <p>Optional first-party analytics helps us understand visits, quiz progress, challenge use and successful browser share handoffs. The quiz works fully without it.</p>
        <details><summary>What is and is not collected</summary><p>We collect controlled event names, region, broad score and duration bands, approved surfaces and channels. We do not collect names, photographs, answers, contact details, full URLs, challenge codes, credentials, advertising identifiers or browser fingerprints. Raw events expire after no more than 30 days.</p></details>
        <p className="analytics-consent-legal">This technical control still requires owner and appropriate legal review before production activation.</p>
      </div>
      <div className="analytics-consent-actions" aria-label="Analytics preference">
        <button type="button" className="analytics-consent-choice" onClick={() => void accept()}>Accept analytics</button>
        <button type="button" className="analytics-consent-choice" onClick={reject}>Reject analytics</button>
        {choice !== "unknown" && <button type="button" className="analytics-consent-cancel" onClick={() => setManageOpen(false)}>Keep current choice</button>}
      </div>
    </section> : <button type="button" className="analytics-manage" onClick={() => setManageOpen(true)}>Manage analytics preferences</button>}
  </>;
}
