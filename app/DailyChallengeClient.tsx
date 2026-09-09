"use client";

/* eslint-disable @next/next/no-img-element -- question images are reviewed same-origin answer assets */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DailyCompletionProjection, DailyStartProjection } from "../db/dailyChallenge.ts";
import { getOrCreateAnonymousSession } from "./anonymousSession.ts";
import { defaultAvatarId } from "./avatarRegistry.ts";
import { regions, type RegionKey } from "./publicGameData.ts";
import { resolveBrowserPublicAppOrigin } from "./publicAppOrigin.ts";
import {
  clearDailyRecovery, createDailyIdempotencyKey, DAILY_RECOVERY_VERSION, extendDailyOwnership,
  formatDailyCountdown, getOrCreateDailyOwnership, readDailyOwnership, readDailyRecovery, writeDailyRecovery,
} from "./dailyChallengeClient.ts";

type StartBody = { available: boolean } & Partial<DailyStartProjection>;
type CompletionBody = { completed: boolean } & Partial<DailyCompletionProjection>;

export default function DailyChallengeClient({ region, serverNow, nextBoundary, streaksEnabled }: Readonly<{ region: RegionKey; serverNow: number; nextBoundary: number; streaksEnabled: boolean }>) {
  const [selection, setSelection] = useState<DailyStartProjection | null>(null);
  const [answers, setAnswers] = useState<readonly (readonly string[])[]>([]);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<DailyCompletionProjection | null>(null);
  const [status, setStatus] = useState("Ready for today’s shared set.");
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(nextBoundary - serverNow);
  const [online, setOnline] = useState(true);
  const [shareUrl, setShareUrl] = useState("");
  const [startKey, setStartKey] = useState("");
  const anchor = useRef<{ serverNow: number; monotonic: number } | null>(null);

  const authoritativeClientNow = () => {
    const current = anchor.current;
    return current ? current.serverNow + Math.max(0, performance.now() - current.monotonic) : serverNow;
  };

  const ownershipCredential = (mode: "official" | "practice") => {
    const now = authoritativeClientNow();
    if (streaksEnabled) {
      const existing = readDailyOwnership(localStorage, now);
      if (existing.available) return existing;
      if (mode === "official") return getOrCreateDailyOwnership(localStorage, sessionStorage, nextBoundary, crypto, now);
    }
    return getOrCreateAnonymousSession(sessionStorage);
  };

  useEffect(() => {
    anchor.current = { serverNow, monotonic: performance.now() };
    const update = () => {
      const elapsed = performance.now() - (anchor.current?.monotonic || 0);
      setRemaining(Math.max(0, nextBoundary - (anchor.current?.serverNow || serverNow) - elapsed));
    };
    const network = () => setOnline(navigator.onLine);
    update(); network();
    const timer = window.setInterval(update, 1000);
    window.addEventListener("online", network); window.addEventListener("offline", network);
    return () => { window.clearInterval(timer); window.removeEventListener("online", network); window.removeEventListener("offline", network); };
  }, [nextBoundary, serverNow]);

  const question = selection?.questions[index];
  const selected = answers[index] || [];
  const start = async (mode: "official" | "practice") => {
    if (busy) return;
    setBusy(true); setStatus("Preparing the authoritative set…");
    try {
      const session = ownershipCredential(mode);
      if (!session.available) throw new Error("session");
      const saved = readDailyRecovery(localStorage, Date.now());
      const canResume = saved?.region === region && saved.mode === mode;
      const startIdempotencyKey = canResume ? saved.startIdempotencyKey : createDailyIdempotencyKey();
      setStartKey(startIdempotencyKey);
      const response = await fetch("/daily/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ region, mode, anonymousSessionCredential: session.sessionId, idempotencyKey: startIdempotencyKey }) });
      const body = await response.json() as StartBody;
      if (!response.ok || !body.available || !body.questions || !body.date || !body.expiresAt || !body.sharePath) throw new Error("start");
      const next = body as DailyStartProjection;
      const sameAttempt = Boolean(canResume && next.attemptId === saved?.attemptId
        && next.questions.every((item, questionIndex) => item.questionRef === saved.questionRefs[questionIndex]));
      const recoveredAnswers = sameAttempt ? saved!.answerOptionIds : [];
      setSelection(next); setAnswers(recoveredAnswers); setIndex(sameAttempt ? Math.min(recoveredAnswers.length, 11) : 0); setResult(null);
      setShareUrl(`${resolveBrowserPublicAppOrigin(window.location.origin)}${next.sharePath}`);
      if (next.officialAlreadyCompleted && mode === "official") setStatus("Today’s official entry is already complete. Practice remains available without changing it.");
      else {
        setStatus(mode === "official" ? "Official daily play. One result can count today." : "Practice replay. This score will not change your official result or streak.");
        if (next.attemptId) writeDailyRecovery(localStorage, { version: DAILY_RECOVERY_VERSION, attemptId: next.attemptId, startIdempotencyKey, date: next.date, region, mode, questionRefs: next.questions.map((item) => item.questionRef), answerOptionIds: recoveredAnswers, expiresAt: next.expiresAt });
      }
    } catch { setStatus(online ? "The daily set is unavailable right now. Please try again." : "You’re offline. Reconnect and try again; no score has been invented."); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (selection || result) return;
    const recovery = readDailyRecovery(localStorage, serverNow);
    if (recovery?.region !== region) return;
    const timer = window.setTimeout(() => setStatus("A daily attempt is saved on this device. Start the same mode to recover its authoritative set."), 0);
    return () => window.clearTimeout(timer);
  }, [region, result, selection, serverNow]);

  const choose = (optionId: string) => {
    if (!question || busy) return;
    const next = [...answers];
    if (question.kind === "multi") {
      const current = [...selected];
      next[index] = current.includes(optionId) ? current.filter((item) => item !== optionId) : current.length < 3 ? [...current, optionId] : current;
    } else next[index] = [optionId];
    setAnswers(Object.freeze(next.map((set) => Object.freeze(set || []))));
    if (selection?.attemptId && startKey) writeDailyRecovery(localStorage, {
      version: DAILY_RECOVERY_VERSION, attemptId: selection.attemptId, startIdempotencyKey: startKey,
      date: selection.date, region, mode: selection.mode, questionRefs: selection.questions.map((item) => item.questionRef),
      answerOptionIds: next.map((set) => set || []), expiresAt: selection.expiresAt,
    });
  };

  const advance = () => {
    if (!selected.length || !selection) return;
    if (index < selection.questions.length - 1) { setIndex(index + 1); return; }
    void submit();
  };

  const submit = async () => {
    if (!selection?.attemptId || answers.length !== 12 || busy) return;
    setBusy(true); setStatus(online ? "Confirming your answers…" : "Saved locally. Reconnect, then choose Retry submission.");
    if (!online) { setBusy(false); return; }
    try {
      const session = ownershipCredential(selection.mode);
      if (!session.available) throw new Error("session");
      const response = await fetch("/daily/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        attemptId: selection.attemptId, anonymousSessionCredential: session.sessionId, avatarId: defaultAvatarId,
        answers: selection.questions.map((item, answerIndex) => ({ questionStableId: item.questionRef, selectedOptionIds: answers[answerIndex] })),
      }) });
      const body = await response.json() as CompletionBody;
      if (!response.ok || !body.completed || typeof body.score !== "number" || typeof body.total !== "number") throw new Error("complete");
      if (streaksEnabled && selection.mode === "official"
        && (!body.streak || !extendDailyOwnership(localStorage, session.sessionId, body.streak.expiresAt, authoritativeClientNow()))) throw new Error("ownership");
      setResult(body as DailyCompletionProjection); clearDailyRecovery(localStorage); setStatus("Your authoritative result is confirmed.");
    } catch { setStatus("Your answers remain saved on this device. Retry after the connection is stable."); }
    finally { setBusy(false); }
  };

  return <main className={`daily-shell theme-${region}`}>
    <header className="daily-heading"><p>One shared set · UTC</p><h1>{regions[region].name} Daily Challenge</h1><div className="daily-countdown" role="timer" aria-live="off"><span>Next set in</span><strong>{formatDailyCountdown(remaining)}</strong></div></header>
    <p className="daily-safeguard">A playful culture score, never a measure of human worth.</p>
    <p className="daily-privacy-note">An official completion can update a private regional streak when that separate feature is active. It expires exactly 180 days after your latest valid official daily completion; practice and ordinary play never extend it. You can clear it from Privacy choices.</p>
    {!selection && !result && <section className="daily-start" aria-labelledby="daily-start-title"><h2 id="daily-start-title">Today’s twelve</h2><p>Everyone in this edition receives the same authoritative question versions until the next UTC day. No account is required.</p><div><button disabled={busy} onClick={() => void start("official")}>Play today’s official set</button><button disabled={busy} onClick={() => void start("practice")}>Practise without changing a streak</button></div></section>}
    {selection?.officialAlreadyCompleted && !result && <section className="daily-result"><h2>Official entry complete</h2><p>Your first confirmed result remains today’s official one.</p><button onClick={() => void start("practice")}>Practise the set</button></section>}
    {question && !selection?.officialAlreadyCompleted && !result && <section className="daily-question" aria-labelledby="daily-question-title"><p>Question {index + 1} of {selection.questions.length}</p><h2 id="daily-question-title">{question.text}</h2><fieldset className={question.kind === "image" ? "daily-image-options" : undefined}><legend>{question.kind === "multi" ? "Choose every answer that applies" : "Choose one answer"}</legend>{question.options.map((option, optionIndex) => {
      const imageAsset = question.imageAssets[optionIndex];
      const imageDescription = question.imageDescriptions[optionIndex];
      const imageLabel = question.kind === "image" ? `Option ${option.text}: ${imageDescription}` : undefined;
      return <label key={option.id}><input type={question.kind === "multi" ? "checkbox" : "radio"} name={`daily-${index}`} checked={selected.includes(option.id)} onChange={() => choose(option.id)} aria-label={imageLabel} />{question.kind === "image" && <img src={imageAsset} alt={imageDescription} />} <span>{question.kind === "image" ? `Option ${option.text}` : option.text}</span></label>;
    })}</fieldset><button disabled={!selected.length || busy} onClick={advance}>{index === 11 ? "Confirm result" : "Next question"}</button></section>}
    {result && <section className="daily-result" aria-live="polite"><p>{result.official ? "Official result" : "Practice result"}</p><h2>{result.score}/{result.total}</h2>{result.streak && <div className="daily-streak"><strong>{result.streak.current} day streak</strong><span>Best: {result.streak.best}</span><span>Milestone: {result.streak.milestone.replaceAll("-", " ")}{result.streak.masterySeal ? " · mastery seal earned" : ""}</span></div>}<button onClick={() => void start("practice")}>Practise again</button></section>}
    {selection && shareUrl && <div className="daily-share"><label htmlFor="daily-share-url">Today’s expiry-bounded link</label><input id="daily-share-url" readOnly value={shareUrl} /><button onClick={() => void navigator.clipboard?.writeText(shareUrl)}>Copy link</button></div>}
    <p className="daily-status" role="status">{status}</p>
    <nav className="daily-regions" aria-label="Daily challenge editions">{(Object.keys(regions) as RegionKey[]).map((key) => <Link key={key} href={`/daily/${key}`} aria-current={key === region ? "page" : undefined}>{regions[key].name}</Link>)}</nav>
    <Link className="daily-home" href="/">Return to the game</Link>
  </main>;
}
