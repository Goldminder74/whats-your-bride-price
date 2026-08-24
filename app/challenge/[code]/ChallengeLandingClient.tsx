"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import BridePriceGame from "../../BridePriceGame";
import {
  deriveAnonymousSubjectHash,
  getOrCreateAnonymousSession,
} from "../../anonymousSession";
import { defaultAvatarId, resolveApprovedAvatar } from "../../avatarRegistry";
import { emitChallengeEvent } from "../../challengeEvents";
import { emitNominationEvent } from "../../nominationEvents";
import type { TrustedChallengeEntry } from "../../challengeEntry";
import type { ChallengeLandingState } from "../../challengeLandingServer";
import { createChallengeIdempotencyKey } from "../../challengeCreation";
import type { ChallengeCompletionClient } from "../../challengeCompletion";
import type { ChallengeAnswerSubmission } from "../../../db/challengeCompletion";
import { entryContextToQuery, parseEntryContext, type EntryContext } from "../../entryContext";
import { regions } from "../../gameData";
import { PRODUCT_SAFEGUARD } from "../../productSafeguards";
import {
  createQuizInstanceId,
  readQuizRecovery,
  safeRecoveryAttribution,
  writeQuizRecovery,
} from "../../quizRecovery";
import { isSafeChallengeComparisonProjection } from "../../../db/challengeCompletion";

type AcceptedState = Readonly<{
  context: EntryContext;
  quizInstanceId: string;
  anonymousSubjectHash: string;
}>;

type ChallengeLandingClientProps = Readonly<{
  code: string;
  initialState: ChallengeLandingState;
}>;

function acceptedEntryContext(code: string, edition: TrustedChallengeEntry["edition"]): EntryContext {
  const browserContext = parseEntryContext(window.location.search, document.referrer);
  return parseEntryContext(entryContextToQuery(browserContext, {
    challenge: code,
    edition,
    nominated: "1",
  }));
}

function normalQuizHref(edition?: TrustedChallengeEntry["edition"]): string {
  return edition ? `/?edition=${edition}` : "/";
}

export default function ChallengeLandingClient({ code, initialState }: ChallengeLandingClientProps) {
  const [state, setState] = useState(initialState);
  const [acceptanceState, setAcceptanceState] = useState<"idle" | "loading" | "failure">("idle");
  const [accepted, setAccepted] = useState<AcceptedState | null>(null);
  const [completedOnDevice, setCompletedOnDevice] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const idempotencyKeyRef = useRef<string | null>(null);
  const acceptancePromiseRef = useRef<Promise<void> | null>(null);
  const emittedViewRef = useRef(false);
  const emittedInvalidRef = useRef(false);
  const emittedAcceptRef = useRef(false);

  const trustedChallenge = useMemo<TrustedChallengeEntry | null>(() => {
    if (state.kind !== "active") return null;
    return Object.freeze({
      code: state.challenge.challengeCode,
      inviterDisplayName: state.challenge.displayName,
      edition: state.challenge.edition,
      verifiedScore: state.challenge.scoreToBeat,
      total: 12,
      avatarId: state.challenge.avatarId,
      validity: "valid",
    });
  }, [state]);

  useEffect(() => {
    if (state.kind === "active" && !emittedViewRef.current) {
      emittedViewRef.current = true;
      emitChallengeEvent({ name: "challenge_view", edition: state.challenge.edition, state: "active" });
      emitNominationEvent({ name: "referred_visit", surface: "challenge_landing", edition: state.challenge.edition });
    }
    if (state.kind !== "active" && !emittedInvalidRef.current) {
      emittedInvalidRef.current = true;
      emitChallengeEvent({
        name: "challenge_invalid",
        state: state.kind === "temporary_failure" ? "temporary_failure" : "unavailable",
      });
    }
  }, [state]);

  useEffect(() => {
    if (!trustedChallenge) return;
    const frame = window.requestAnimationFrame(async () => {
      const recovery = readQuizRecovery(window.localStorage, window.sessionStorage);
      if (!recovery || recovery.trustedChallengeCode !== code || recovery.edition !== trustedChallenge.edition) return;
      const session = getOrCreateAnonymousSession(window.sessionStorage);
      if (!session.available) { setCompletedOnDevice(recovery.questionPosition === 12); return; }
      const anonymousSubjectHash = await deriveAnonymousSubjectHash(session.sessionId);
      if (!anonymousSubjectHash) { setCompletedOnDevice(recovery.questionPosition === 12); return; }
      setAccepted({
        context: acceptedEntryContext(code, trustedChallenge.edition),
        quizInstanceId: recovery.instanceId,
        anonymousSubjectHash,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [code, trustedChallenge]);

  useEffect(() => {
    const restoreLanding = (event: PopStateEvent) => {
      const historyState = event.state as { wybpChallengeAccepted?: boolean } | null;
      if (!historyState?.wybpChallengeAccepted) setAccepted(null);
    };
    window.addEventListener("popstate", restoreLanding);
    return () => window.removeEventListener("popstate", restoreLanding);
  }, []);

  const accept = async () => {
    if (!trustedChallenge || acceptanceState === "loading") return;
    setAcceptanceState("loading");
    setStatusMessage("Accepting your challenge…");
    try {
      const session = getOrCreateAnonymousSession(window.sessionStorage);
      if (!session.available) throw new Error("anonymous_session_unavailable");
      const anonymousSubjectHash = await deriveAnonymousSubjectHash(session.sessionId);
      const quizInstanceId = createQuizInstanceId();
      if (!anonymousSubjectHash || !quizInstanceId) throw new Error("secure_identity_unavailable");
      idempotencyKeyRef.current ||= createChallengeIdempotencyKey();
      const response = await fetch(`/challenge/${code}/accept`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKeyRef.current,
          anonymousSubjectHash,
        }),
      });
      const body = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok || body?.accepted !== true || body.challengeCode !== code || body.edition !== trustedChallenge.edition) {
        if (response.status === 404) {
          setState({ kind: "unavailable", message: "This challenge is no longer available." });
          setAcceptanceState("idle");
          setStatusMessage("");
          return;
        }
        throw new Error("challenge_acceptance_failed");
      }

      const context = acceptedEntryContext(code, trustedChallenge.edition);
      writeQuizRecovery(window.localStorage, window.sessionStorage, {
        version: 1,
        instanceId: quizInstanceId,
        edition: trustedChallenge.edition,
        avatarId: defaultAvatarId,
        questionPosition: 0,
        answerChoices: [],
        updatedAt: Date.now(),
        attribution: safeRecoveryAttribution(context),
        trustedChallengeCode: code,
      });
      if (!emittedAcceptRef.current) {
        emittedAcceptRef.current = true;
        emitChallengeEvent({ name: "challenge_accept", edition: trustedChallenge.edition, state: "active" });
      }
      window.history.replaceState(
        { ...(window.history.state || {}), wybpChallengeLanding: true },
        "",
        window.location.pathname,
      );
      window.history.pushState({ wybpChallengeAccepted: true }, "", window.location.pathname);
      setAccepted({ context, quizInstanceId, anonymousSubjectHash });
      setAcceptanceState("idle");
      setStatusMessage("");
    } catch {
      setAcceptanceState("failure");
      setStatusMessage("The connection paused before acceptance was confirmed. Retry, or choose a normal quiz.");
    } finally {
      acceptancePromiseRef.current = null;
    }
  };

  const beginAcceptance = () => {
    acceptancePromiseRef.current ||= accept();
    return acceptancePromiseRef.current;
  };

  const completionClient = useMemo<ChallengeCompletionClient | undefined>(() => {
    if (!accepted || !trustedChallenge) return undefined;
    return Object.freeze({
      storageAvailable: true,
      async complete(answers: readonly ChallengeAnswerSubmission[]) {
        const response = await fetch(`/challenge/${code}/complete`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            anonymousSubjectHash: accepted.anonymousSubjectHash,
            idempotencyKey: accepted.quizInstanceId,
            answers,
          }),
        });
        const body = await response.json().catch(() => null) as Record<string, unknown> | null;
        if (!response.ok || body?.completed !== true || !isSafeChallengeComparisonProjection(body.comparison)) {
          throw new Error("challenge_completion_failed");
        }
        return body.comparison;
      },
    });
  }, [accepted, code, trustedChallenge]);

  if (accepted && trustedChallenge) {
    return (
      <BridePriceGame
        initialEntryContext={accepted.context}
        trustedChallenge={trustedChallenge}
        acceptedChallenge
        acceptedChallengeQuizInstanceId={accepted.quizInstanceId}
        challengeCompletionClient={completionClient}
      />
    );
  }

  if (completedOnDevice && trustedChallenge) {
    return (
      <main className="challenge-route-shell challenge-completed-shell" data-challenge-completed>
        <section className="challenge-state-card" aria-labelledby="challenge-completed-title">
          <p className="challenge-route-kicker">Challenge already played</p>
          <h1 id="challenge-completed-title">You completed this challenge on this device.</h1>
          <p>No comparison is shown yet. Official challenge results arrive in a later game update.</p>
          <p className="challenge-route-safeguard">{PRODUCT_SAFEGUARD}</p>
          <Link className="challenge-normal-link" href={normalQuizHref(trustedChallenge.edition)}>Play this region as a normal quiz</Link>
        </section>
      </main>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <main className="challenge-route-shell challenge-unavailable-shell" data-challenge-unavailable>
        <section className="challenge-state-card" aria-labelledby="challenge-unavailable-title">
          <span className="challenge-neutral-mark" aria-hidden="true">W</span>
          <p className="challenge-route-kicker">Culture challenge</p>
          <h1 id="challenge-unavailable-title">{state.message}</h1>
          <p>The invitation may have expired or changed. No private details are shown.</p>
          <p className="challenge-route-safeguard">{PRODUCT_SAFEGUARD}</p>
          <Link className="challenge-normal-link" href="/">Choose a normal regional quiz</Link>
        </section>
      </main>
    );
  }

  if (state.kind === "temporary_failure") {
    return (
      <main className="challenge-route-shell challenge-temporary-shell" data-challenge-temporary>
        <section className="challenge-state-card" aria-labelledby="challenge-temporary-title">
          <span className="challenge-neutral-mark" aria-hidden="true">W</span>
          <p className="challenge-route-kicker">Culture challenge</p>
          <h1 id="challenge-temporary-title">{state.message}</h1>
          <p>Your invitation details remain private. Retry when your connection is ready.</p>
          <div className="challenge-state-actions">
            <button type="button" onClick={() => window.location.reload()}>Retry challenge</button>
            <Link href="/">Choose a normal regional quiz</Link>
          </div>
        </section>
      </main>
    );
  }

  const challenge = state.challenge;
  const region = regions[challenge.edition];
  const inviterAvatar = resolveApprovedAvatar(challenge.avatarId);
  const artworkName = challenge.edition === "south" ? "southern" : challenge.edition;

  return (
    <main className={`challenge-route-shell challenge-region-${challenge.edition}`} data-challenge-active>
      <section className="challenge-route-copy" aria-labelledby="challenge-route-title">
        <div className="challenge-route-emblem" aria-hidden="true">{region.mark}</div>
        <p className="challenge-route-kicker">A verified culture challenge</p>
        <div className="challenge-route-inviter">
          {/* Approved static avatar assets intentionally bypass the image proxy. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={inviterAvatar.src} alt={`${challenge.displayName}’s approved game avatar`} width="160" height="160" />
          <p><strong>{challenge.displayName}</strong> has challenged you</p>
        </div>
        <p className="challenge-route-edition">{challenge.editionLabel} Edition</p>
        <h1 id="challenge-route-title">Can you protect the family reputation?</h1>
        <p className="challenge-route-score">Score to beat: <strong>{challenge.scoreToBeat}/{challenge.maximumScore}</strong></p>
        <p className="challenge-route-safeguard" id="challenge-route-safeguard">{PRODUCT_SAFEGUARD}</p>
        <button
          className="challenge-accept-action"
          type="button"
          onClick={beginAcceptance}
          disabled={acceptanceState === "loading"}
          aria-busy={acceptanceState === "loading"}
          aria-describedby="challenge-route-safeguard"
        >
          {acceptanceState === "loading" ? "Accepting challenge…" : acceptanceState === "failure" ? "Retry acceptance" : "Accept challenge"}
          <span aria-hidden="true">▶</span>
        </button>
        {statusMessage && <p className="challenge-route-status" role="status" aria-live="polite">{statusMessage}</p>}
        <Link className="challenge-secondary-link" href={normalQuizHref()}>Choose a normal quiz instead</Link>
      </section>
      <div className="challenge-route-art" aria-label={`${challenge.editionLabel} regional game artwork`}>
        {/* Approved regional art is already mobile-optimised WebP. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/regions/${artworkName}-africa.webp`} alt={`${challenge.editionLabel} illustrated game world`} width="1200" height="800" fetchPriority="high" />
        <span aria-hidden="true">{region.mark}</span>
      </div>
    </main>
  );
}
