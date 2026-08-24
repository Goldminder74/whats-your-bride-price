"use client";

/* eslint-disable react-hooks/set-state-in-effect -- tab-scoped nomination continuity is restored after browser hydration */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChallengeCreationClient, ChallengeActionMode } from "./challengeCreation.ts";
import { createChallengeIdempotencyKey } from "./challengeCreation.ts";
import { publicDisplayNameFallback, validateDisplayName } from "./displayNames.ts";
import type { RegionKey } from "./gameData.ts";
import {
  genericNominationShareText,
  genericNominationUrl,
  isNativeShareCancellation,
  nominationSlotNumbers,
  nominationSnapshotVersion,
  personalisedChallengeSentence,
  personalisedChallengeShareText,
  readNominationSnapshot,
  validateSafeNominationChallenge,
  whatsappShareUrl,
  writeNominationSnapshot,
  type NominationSlotNumber,
  type NominationSlotState,
  type SafeNominationChallenge,
} from "./nominationExperience.ts";
import {
  emitNominationEvent,
  type NominationChannel,
  type NominationSurface,
} from "./nominationEvents.ts";
import { PRODUCT_SAFEGUARD } from "./productSafeguards.ts";
import { resolveBrowserPublicAppOrigin } from "./publicAppOrigin.ts";
import { copyShareText, hasWebShare } from "./shareSupport.ts";

type SlotView = Readonly<{
  state: NominationSlotState;
  message: string;
  manualText: string;
}>;

type NominateThreePanelProps = Readonly<{
  surface: NominationSurface;
  edition: RegionKey;
  defaultDisplayName: string;
  scopeId: string;
  actionMode: ChallengeActionMode;
  challengeCreationClient?: ChallengeCreationClient;
  onClose(): void;
}>;

const readySlot = (): SlotView => Object.freeze({
  state: "ready",
  message: "Ready for a sharing handoff.",
  manualText: "",
});

function initialSlots(): Record<NominationSlotNumber, SlotView> {
  return { 1: readySlot(), 2: readySlot(), 3: readySlot() };
}

export default function NominateThreePanel({
  surface,
  edition,
  defaultDisplayName,
  scopeId,
  actionMode,
  challengeCreationClient,
  onClose,
}: NominateThreePanelProps) {
  const initialName = validateDisplayName(defaultDisplayName);
  const [challengerName, setChallengerName] = useState(initialName.valid && initialName.value ? initialName.value : publicDisplayNameFallback);
  const [challenge, setChallenge] = useState<SafeNominationChallenge | null>(null);
  const [preparationState, setPreparationState] = useState<"idle" | "creating" | "ready" | "failed">("idle");
  const [preparationMessage, setPreparationMessage] = useState("");
  const [slots, setSlots] = useState<Record<NominationSlotNumber, SlotView>>(initialSlots);
  const [completedSlots, setCompletedSlots] = useState<Set<NominationSlotNumber>>(() => new Set());
  const [celebrating, setCelebrating] = useState(false);
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const creationPromiseRef = useRef<ReturnType<ChallengeCreationClient["create"]> | null>(null);
  const handedOffRef = useRef<Set<NominationSlotNumber>>(new Set());
  const nameValidation = useMemo(() => validateDisplayName(challengerName), [challengerName]);
  const personalised = actionMode === "personalised" && challengeCreationClient?.storageAvailable === true;

  useEffect(() => {
    setNativeShareAvailable(hasWebShare(navigator));
    if (!personalised) {
      setPreparationState("ready");
      setPreparationMessage("Verified challenge storage is unavailable, so these are honest regional invitations without an inviter score.");
      return;
    }
    const restored = readNominationSnapshot(window.sessionStorage, scopeId, window.location.origin);
    if (!restored) return;
    setChallenge(restored.challenge);
    setChallengerName(restored.challenge.projection.displayName);
    setPreparationState("ready");
    setPreparationMessage("Your existing verified challenge is ready again. The same safe link is used for every slot.");
    const completed = new Set(restored.completedSlots);
    handedOffRef.current = completed;
    setCompletedSlots(completed);
    setSlots(Object.fromEntries(nominationSlotNumbers.map((slot) => [
      slot,
      completed.has(slot)
        ? Object.freeze({ state: "handed_off", message: "A sharing handoff was completed for this slot. Delivery is not claimed.", manualText: "" })
        : readySlot(),
    ])) as Record<NominationSlotNumber, SlotView>);
    setCelebrating(completed.size === 3);
  }, [personalised, scopeId]);

  const updateSlot = (slot: NominationSlotNumber, next: SlotView) => {
    setSlots((current) => ({ ...current, [slot]: Object.freeze(next) }));
  };

  const persist = (safeChallenge: SafeNominationChallenge, nextCompleted: Set<NominationSlotNumber>) => {
    writeNominationSnapshot(window.sessionStorage, Object.freeze({
      version: nominationSnapshotVersion,
      scope: scopeId,
      challenge: safeChallenge,
      completedSlots: Object.freeze([...nextCompleted].sort()),
      savedAt: Date.now(),
    }));
  };

  const prepareChallenge = async () => {
    if (!personalised || !challengeCreationClient || preparationState === "creating") return;
    if (!nameValidation.valid) {
      setPreparationMessage(nameValidation.message);
      return;
    }
    const requestedName = nameValidation.value || publicDisplayNameFallback;
    setPreparationState("creating");
    setPreparationMessage("Preparing one verified challenge for all three slots…");
    try {
      idempotencyKeyRef.current ||= createChallengeIdempotencyKey();
      creationPromiseRef.current ||= challengeCreationClient.create(idempotencyKeyRef.current, requestedName);
      const response = await creationPromiseRef.current;
      const origin = resolveBrowserPublicAppOrigin(window.location.origin);
      const safeChallenge = validateSafeNominationChallenge(response.challenge, response.challengeUrl, origin);
      if (!safeChallenge) throw new Error("unsafe_challenge_projection");
      setChallenge(safeChallenge);
      setChallengerName(safeChallenge.projection.displayName);
      setPreparationState("ready");
      setPreparationMessage(safeChallenge.projection.displayName === requestedName
        ? "One verified challenge is ready. Every slot uses this same canonical link."
        : `An existing challenge was safely reused under the approved name ${safeChallenge.projection.displayName}.`);
      persist(safeChallenge, completedSlots);
    } catch (error) {
      creationPromiseRef.current = null;
      setPreparationState("failed");
      setPreparationMessage(error instanceof Error && "userMessage" in error && typeof error.userMessage === "string"
        ? error.userMessage
        : "A verified challenge could not be created. No challenge was invented. Try again, or use the regional invitation fallback later.");
    }
  };

  const sharePayload = useMemo(() => {
    if (challenge) {
      return {
        title: "You’ve been challenged!",
        url: challenge.challengeUrl,
        completeText: personalisedChallengeShareText(challenge),
        nativeText: `${personalisedChallengeSentence(challenge)}\n${PRODUCT_SAFEGUARD}`,
      };
    }
    if (typeof window === "undefined" || personalised) return null;
    const origin = resolveBrowserPublicAppOrigin(window.location.origin);
    const url = genericNominationUrl(edition, origin);
    const completeText = genericNominationShareText(edition, url);
    return {
      title: "You’ve been invited to play!",
      url,
      completeText,
      nativeText: completeText.slice(0, -(url.length + 1)),
    };
  }, [challenge, edition, personalised]);

  const recordHandoff = (slot: NominationSlotNumber, channel: NominationChannel, message: string) => {
    updateSlot(slot, { state: "handed_off", message, manualText: "" });
    if (handedOffRef.current.has(slot)) return;
    handedOffRef.current.add(slot);
    const nextCompleted = new Set(handedOffRef.current);
    setCompletedSlots(nextCompleted);
    emitNominationEvent({ name: "share_handoff", surface, channel, slot, edition });
    if (challenge) persist(challenge, nextCompleted);
    if (nextCompleted.size === 3) setCelebrating(true);
  };

  const shareSlot = async (slot: NominationSlotNumber, channel: NominationChannel) => {
    emitNominationEvent({ name: "share_intent", surface, channel, slot, edition });
    if (!sharePayload) {
      updateSlot(slot, { state: "failed", message: "Prepare the verified challenge before sharing this slot.", manualText: "" });
      return;
    }
    updateSlot(slot, { state: "opening", message: "Opening a sharing handoff…", manualText: "" });
    if (channel === "whatsapp") {
      const destination = whatsappShareUrl(sharePayload.completeText);
      const popup = window.open("about:blank", "_blank");
      if (!popup) {
        updateSlot(slot, { state: "failed", message: "WhatsApp did not open. Retry or use Copy link.", manualText: sharePayload.completeText });
        return;
      }
      try {
        popup.opener = null;
        popup.location.replace(destination);
      } catch {
        try { popup.close(); } catch { /* the browser already owns the failed browsing context */ }
        updateSlot(slot, { state: "failed", message: "WhatsApp did not open. Retry or use Copy link.", manualText: sharePayload.completeText });
        return;
      }
      recordHandoff(slot, channel, "WhatsApp opened with the challenge ready. This records a handoff, not message delivery.");
      return;
    }
    if (channel === "native") {
      if (!hasWebShare(navigator)) {
        updateSlot(slot, { state: "failed", message: "Your browser does not offer the native share sheet. Use WhatsApp or Copy link.", manualText: sharePayload.completeText });
        return;
      }
      try {
        await navigator.share({ title: sharePayload.title, text: sharePayload.nativeText, url: sharePayload.url });
        recordHandoff(slot, channel, "The share sheet completed its handoff. Message delivery is not claimed.");
      } catch (error) {
        if (isNativeShareCancellation(error)) {
          updateSlot(slot, { state: "cancelled", message: "Share cancelled. This slot is still ready when you are.", manualText: "" });
        } else {
          updateSlot(slot, { state: "failed", message: "The share sheet could not complete. Retry or use Copy link.", manualText: sharePayload.completeText });
        }
      }
      return;
    }
    const copied = await copyShareText(navigator.clipboard, sharePayload.completeText);
    if (copied === "copied") {
      recordHandoff(slot, channel, "Challenge link copied. Paste it where you choose; delivery is not claimed.");
    } else {
      updateSlot(slot, { state: "failed", message: "Clipboard access is unavailable. Select and copy the text below manually; this slot is not complete yet.", manualText: sharePayload.completeText });
    }
  };

  return (
    <section className="nominate-three-panel" aria-labelledby="nominate-three-title" data-nominate-three data-mode={personalised ? "personalised" : "generic"}>
      <div className="nomination-panel-heading">
        <div><p className="nomination-kicker">Pass the culture challenge on</p><h3 id="nominate-three-title" tabIndex={-1}>Nominate three people</h3></div>
        <button type="button" className="nomination-close" onClick={onClose} aria-label="Close nomination panel">×</button>
      </div>
      <p className="nomination-intro">Three numbered handoffs, one safe link, and no contact access. Choose how each invitation leaves your device.</p>
      <p className="nomination-safeguard">{PRODUCT_SAFEGUARD}</p>

      {personalised ? (
        <div className="nomination-identity">
          <label htmlFor="challenger-display-name">Challenger name or pseudonym</label>
          <input
            id="challenger-display-name"
            value={challengerName}
            onChange={(event) => setChallengerName(event.target.value)}
            onBlur={() => { if (nameValidation.valid) setChallengerName(nameValidation.value || publicDisplayNameFallback); }}
            disabled={preparationState === "ready"}
            aria-invalid={!nameValidation.valid}
            aria-describedby={!nameValidation.valid ? "challenger-name-error" : "challenger-name-note"}
          />
          {!nameValidation.valid
            ? <p id="challenger-name-error" className="display-name-error" role="alert">{nameValidation.message}</p>
            : <p id="challenger-name-note">This validated name will match the challenge landing page and share copy. It never changes your score.</p>}
          {preparationState !== "ready" && <button type="button" className="prepare-nominations" onClick={prepareChallenge} disabled={preparationState === "creating" || !nameValidation.valid}>{preparationState === "creating" ? "Preparing one challenge…" : "Prepare three nominations"}</button>}
        </div>
      ) : <p className="nomination-fallback-note"><b>Regional invitation fallback</b> Verified challenges and durable storage are unavailable, so no score or inviter identity is attached.</p>}

      {preparationMessage && <p className={`nomination-preparation is-${preparationState}`} role="status" aria-live="polite">{preparationMessage}</p>}
      {sharePayload && <p className="nomination-link-note">All three slots use the same {challenge ? "canonical challenge" : "regional invitation"} link.</p>}

      <div className="nomination-slots" aria-label="Three nomination slots">
        {nominationSlotNumbers.map((slot) => {
          const view = slots[slot];
          return <article className={`nomination-slot state-${view.state}`} key={slot} data-slot={slot} data-slot-state={view.state}>
            <div className="nomination-slot-title"><span aria-hidden="true">{slot}</span><div><h4>Nomination slot {slot}</h4><p>{completedSlots.has(slot) ? "Handoff counted once" : "Awaiting a successful handoff"}</p></div></div>
            <div className="nomination-methods">
              <button type="button" onClick={() => shareSlot(slot, "whatsapp")} disabled={view.state === "opening" || !sharePayload}>WhatsApp</button>
              {nativeShareAvailable && <button type="button" onClick={() => shareSlot(slot, "native")} disabled={view.state === "opening" || !sharePayload}>Share menu</button>}
              <button type="button" onClick={() => shareSlot(slot, "copy")} disabled={view.state === "opening" || !sharePayload}>Copy link</button>
            </div>
            <p className="nomination-slot-status" role="status" aria-live="polite"><b>{view.state.replace("_", " ")}</b> {view.message}</p>
            {view.manualText && <textarea className="nomination-manual-copy" readOnly value={view.manualText} aria-label={`Manual sharing text for nomination slot ${slot}`} onFocus={(event) => event.currentTarget.select()} />}
          </article>;
        })}
      </div>

      {celebrating && <div className="nomination-celebration" role="status" aria-live="polite"><span aria-hidden="true">✦ ◆ ✦</span><b>Three nominations ready to travel. Keep the challenge going!</b><p>Three nomination handoffs were completed or started. Message delivery is not claimed, and every sharing option remains available.</p></div>}
      <p className="nomination-privacy">No names of recipients, telephone numbers, email addresses, contacts, share-sheet contents or private photos are requested or stored.</p>
    </section>
  );
}
