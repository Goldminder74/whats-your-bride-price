"use client";

import { useEffect, useRef } from "react";
import type { ChallengeComparisonProjection } from "../db/challengeCompletion.ts";
import { emitChallengeEvent } from "./challengeEvents";

type ChallengeComparisonProps = Readonly<{
  comparison: ChallengeComparisonProjection;
  onRechallenge: () => void;
  onPlayAnotherRegion: () => void;
  rechallengeBusy?: boolean;
}>;

const outcomeLabels = Object.freeze({
  beat: "Challenge won",
  tied: "Perfect tie",
  did_not_beat: "Knowledge celebrated",
  unavailable: "Your result stands",
});

export default function ChallengeComparison({
  comparison,
  onRechallenge,
  onPlayAnotherRegion,
  rechallengeBusy = false,
}: ChallengeComparisonProps) {
  const emittedRef = useRef(false);
  const rechallengeRef = useRef(false);
  useEffect(() => {
    if (emittedRef.current) return;
    emittedRef.current = true;
    emitChallengeEvent({ name: "comparison_view", edition: comparison.edition, state: "completed" });
    emitChallengeEvent({
      name: "comparison_outcome",
      edition: comparison.edition,
      state: "completed",
      outcome: comparison.outcome,
    });
  }, [comparison.edition, comparison.outcome]);

  const rechallenge = () => {
    if (!rechallengeRef.current) {
      rechallengeRef.current = true;
      emitChallengeEvent({ name: "rechallenge_start", edition: comparison.edition, state: "completed" });
    }
    onRechallenge();
  };

  const difference = comparison.difference === null
    ? null
    : comparison.difference === 0
      ? "Scores level"
      : `${Math.abs(comparison.difference)} point${Math.abs(comparison.difference) === 1 ? "" : "s"} ${comparison.difference > 0 ? "ahead" : "apart"}`;

  return (
    <section
      className={`challenge-comparison comparison-${comparison.outcome}`}
      aria-labelledby="comparison-title"
      aria-live="polite"
      data-comparison-outcome={comparison.outcome}
    >
      <p className="comparison-kicker">First official comparison</p>
      <h3 id="comparison-title" tabIndex={-1}>{outcomeLabels[comparison.outcome]}</h3>
      <div className="comparison-scoreboard" aria-label="Challenge scores">
        <div><span>{comparison.inviterDisplayName}</span><b>{comparison.inviterScore === null ? "—" : comparison.inviterScore}</b><small>Inviter score</small></div>
        <i aria-hidden="true">◆</i>
        <div><span>You</span><b>{comparison.recipientScore}</b><small>Your score</small></div>
      </div>
      <p className="comparison-maximum">Scores shown out of {comparison.maximumScore}</p>
      {difference && <p className="comparison-difference">{difference}</p>}
      <p className="comparison-explanation">{comparison.explanation}</p>
      {comparison.masterySealAwarded && <p className="comparison-mastery"><span aria-hidden="true">✦</span> Regional mastery seal earned through the normal 9+ rule.</p>}
      <p className="comparison-safeguard">{comparison.safeguard}</p>
      <div className="comparison-actions">
        <button type="button" className="big-action" onClick={rechallenge} disabled={rechallengeBusy}>
          {rechallengeBusy ? "Creating challenge…" : "Challenge three more people"} <span aria-hidden="true">↗</span>
        </button>
        <button type="button" className="outline-action" onClick={onPlayAnotherRegion}>Play another region</button>
      </div>
    </section>
  );
}
