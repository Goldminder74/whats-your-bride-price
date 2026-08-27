"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { isNativeShareCancellation } from "./nominationExperience";
import {
  emitShareCentreEvent,
  type ShareCentreChannel,
} from "./shareCentreEvents";
import { buildShareCopy, facebookShareDestination, whatsappShareDestination } from "./shareCopy";
import { downloadPreparedShareMedia, type PreparedShareMedia } from "./shareMedia";
import type { SafeShareProjection } from "./shareProjection";
import { PRODUCT_SAFEGUARD } from "./productSafeguards";
import { RESULT_PUBLICATION_DISCLOSURE } from "../db/resultPublication";
import type { ResultPublicationClient } from "./resultPublicationClient";
import StoryVideoPanel from "./StoryVideoPanel";
import { activeFeatureFlags } from "./featureFlags";
import { PUBLIC_APP_ORIGIN } from "./publicAppOrigin";
import { storyVideoProjectionFromShare } from "./storyVideoProjection";
import { emitAnalyticsLocalEvent } from "./analyticsLocal";

type ShareCentreProps = Readonly<{
  projection: SafeShareProjection;
  prepareMedia: () => Promise<PreparedShareMedia>;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  resultPublicationClient?: ResultPublicationClient;
  soundEnabled?: boolean;
}>;

type ShareStatus = Readonly<{
  kind: "idle" | "working" | "success" | "cancelled" | "failed";
  message: string;
  manualText?: string;
  instructions?: readonly [string, string];
}>;

const idleStatus: ShareStatus = Object.freeze({
  kind: "idle",
  message: "Choose one sharing route. Nothing is sent until you act.",
});

function canShareFiles(media: PreparedShareMedia): boolean {
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [media.file] });
}

export default function ShareCentre({ projection, prepareMedia, onClose, returnFocusRef, resultPublicationClient, soundEnabled = true }: ShareCentreProps) {
  const [activeProjection, setActiveProjection] = useState(projection);
  const [publicationVisibility, setPublicationVisibility] = useState(resultPublicationClient?.currentVisibility || "private");
  const copy = useMemo(() => buildShareCopy(activeProjection), [activeProjection]);
  const [status, setStatus] = useState<ShareStatus>(idleStatus);
  const [busy, setBusy] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [storyVideoOpen, setStoryVideoOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const mediaPromiseRef = useRef<Promise<PreparedShareMedia> | null>(null);
  const preparedMediaRef = useRef<PreparedShareMedia | null>(null);
  const mediaPreparedEventRef = useRef(false);
  const actionLockRef = useRef(false);
  const storyProjection = useMemo(() => activeFeatureFlags.story_video && !activeFeatureFlags.commerce
    ? storyVideoProjectionFromShare(activeProjection, PUBLIC_APP_ORIGIN)
    : null, [activeProjection]);

  const record = (name: Parameters<typeof emitShareCentreEvent>[0]["name"], channel?: ShareCentreChannel, startedAt?: number) => {
    emitShareCentreEvent({
      name,
      surface: activeProjection.surface,
      channel,
      edition: activeProjection.edition,
      ...(startedAt === undefined ? {} : { elapsedMs: performance.now() - startedAt }),
    });
  };

  const getMedia = () => {
    mediaPromiseRef.current ||= prepareMedia().then((media) => {
      preparedMediaRef.current = media;
      setMediaReady(true);
      if (!mediaPreparedEventRef.current) {
        mediaPreparedEventRef.current = true;
        record("share_media_prepared");
      }
      return media;
    });
    return mediaPromiseRef.current;
  };

  useEffect(() => {
    const returnFocusElement = returnFocusRef?.current;
    closeRef.current?.focus();
    void getMedia().catch(() => {
      mediaPromiseRef.current = null;
      setStatus({ kind: "failed", message: "The portrait could not be prepared. Link sharing remains available." });
    });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], textarea")];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      returnFocusElement?.focus();
    };
    // prepareMedia is deliberately captured once for this dialog instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, returnFocusRef]);

  const clipboardFallback = async (channel: ShareCentreChannel, failedMessage: string) => {
    try {
      await navigator.clipboard.writeText(activeProjection.canonicalUrl);
      record("share_copy_succeeded", channel);
      setStatus({ kind: "success", message: `${failedMessage} The safe link was copied instead.` });
    } catch {
      record("share_failed", channel);
      setStatus({ kind: "failed", message: `${failedMessage} Select and copy the safe link below.`, manualText: activeProjection.canonicalUrl });
    }
  };

  const begin = async (channel: ShareCentreChannel, action: () => Promise<void>) => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setBusy(true);
    setStatus({ kind: "working", message: "Preparing your safe sharing handoff…" });
    record("share_action_selected", channel);
    try {
      await action();
    } finally {
      actionLockRef.current = false;
      setBusy(false);
    }
  };

  const openExternal = (channel: "whatsapp" | "facebook", destination: string) => begin(channel, async () => {
    const startedAt = performance.now();
    let popup: Window | null = null;
    try {
      popup = window.open(destination, "_blank", "noopener,noreferrer");
    } catch {
      popup = null;
    }
    if (!popup || popup.closed) {
      await clipboardFallback(channel, `${channel === "whatsapp" ? "WhatsApp" : "Facebook"} did not open.`);
      return;
    }
    record("share_external_handoff", channel, startedAt);
    setStatus({
      kind: "success",
      message: `${channel === "whatsapp" ? "WhatsApp" : "Facebook"} opened. This records a handoff, not a post or message delivery.`,
    });
  });

  const shareToVisualPlatform = (channel: "instagram" | "tiktok") => begin(channel, async () => {
    const label = channel === "instagram" ? "Instagram" : "TikTok";
    const startedAt = performance.now();
    try {
      const media = preparedMediaRef.current;
      if (!media) throw new Error("share_media_not_ready");
      if (typeof navigator.share === "function" && canShareFiles(media)) {
        record("share_sheet_invoked", channel, startedAt);
        try {
          await navigator.share({ title: copy.title, text: copy.sentence, files: [media.file] });
          record("share_external_handoff", channel, startedAt);
          setStatus({ kind: "success", message: `The device share sheet completed its handoff. Choose ${label} there; the game cannot verify the selected app or delivery.` });
        } catch (error) {
          if (isNativeShareCancellation(error)) {
            record("share_cancelled", channel, startedAt);
            setStatus({ kind: "cancelled", message: "Share cancelled. No handoff is counted." });
          } else {
            record("share_failed", channel, startedAt);
            setStatus({ kind: "failed", message: "The device share sheet could not complete. Retry or download the portrait." });
          }
        }
        return;
      }
      downloadPreparedShareMedia(media);
      record("share_download_started", channel, startedAt);
      setStatus({
        kind: "success",
        message: `${label} cannot be targeted directly in this browser, so the story portrait was downloaded.`,
        instructions: channel === "instagram"
          ? ["Open Instagram and create a Story.", "Select the downloaded image."]
          : ["Open TikTok and start a new post or Story.", "Select the downloaded image."],
      });
    } catch {
      record("share_failed", channel, startedAt);
      setStatus({ kind: "failed", message: "The story portrait could not be prepared. Retry or use Copy link." });
    }
  });

  const nativeShare = () => begin("native", async () => {
    const startedAt = performance.now();
    if (typeof navigator.share !== "function") {
      await clipboardFallback("native", "The device share sheet is unavailable.");
      return;
    }
    const data: ShareData = { title: copy.title, text: `${copy.sentence}\n${PRODUCT_SAFEGUARD}`, url: activeProjection.canonicalUrl };
    try {
      const media = preparedMediaRef.current;
      if (media && canShareFiles(media)) data.files = [media.file];
      record("share_sheet_invoked", "native", startedAt);
      await navigator.share(data);
      record("share_external_handoff", "native", startedAt);
      setStatus({ kind: "success", message: "The device share sheet completed its handoff. The game does not claim delivery." });
    } catch (error) {
      if (isNativeShareCancellation(error)) {
        record("share_cancelled", "native", startedAt);
        setStatus({ kind: "cancelled", message: "Share cancelled. No handoff is counted." });
      } else {
        record("share_failed", "native", startedAt);
        setStatus({ kind: "failed", message: "The device share sheet could not complete. Retry or use Copy link." });
      }
    }
  });

  const copyLink = () => begin("copy", async () => {
    const startedAt = performance.now();
    try {
      await navigator.clipboard.writeText(activeProjection.canonicalUrl);
      record("share_copy_succeeded", "copy", startedAt);
      setStatus({ kind: "success", message: "Safe link copied. Paste it where you choose; delivery is not claimed." });
    } catch {
      record("share_failed", "copy", startedAt);
      setStatus({ kind: "failed", message: "Clipboard access is unavailable. Select and copy the safe link below.", manualText: activeProjection.canonicalUrl });
    }
  });

  const download = () => begin("download", async () => {
    const startedAt = performance.now();
    try {
      const media = preparedMediaRef.current;
      if (!media) throw new Error("share_media_not_ready");
      downloadPreparedShareMedia(media);
      record("share_download_started", "download", startedAt);
      setStatus({ kind: "success", message: "Your 9:16 story portrait download started. The image stays on this device unless you choose to share it." });
    } catch {
      record("share_failed", "download", startedAt);
      setStatus({ kind: "failed", message: "The portrait could not be prepared. Please try again." });
    }
  });

  const useStaticStory = async () => {
    const media = preparedMediaRef.current || await getMedia();
    downloadPreparedShareMedia(media);
  };

  const publishResult = async () => {
    if (!resultPublicationClient || busy) return;
    setBusy(true);
    setStatus({ kind: "working", message: "Creating the public result page and safe preview…" });
    try {
      const publicProjection = await resultPublicationClient.publish();
      emitAnalyticsLocalEvent({ name: "result_publish", properties: { edition: publicProjection.edition, surface: "share_centre" } });
      setActiveProjection(publicProjection);
      setPublicationVisibility("public");
      setStatus({ kind: "success", message: "Your permanent result link is ready. Nothing has been posted or delivered." });
    } catch {
      setStatus({ kind: "failed", message: "The result could not be made public. Your current invitation fallback remains available." });
    } finally { setBusy(false); }
  };

  const unpublishResult = async () => {
    if (!resultPublicationClient || busy) return;
    setBusy(true);
    setStatus({ kind: "working", message: "Returning this result to private…" });
    try {
      await resultPublicationClient.unpublish();
      emitAnalyticsLocalEvent({ name: "result_unpublish", properties: { edition: projection.edition, surface: "share_centre" } });
      setActiveProjection(projection);
      setPublicationVisibility("private");
      setStatus({ kind: "success", message: "The permanent result and its generated preview are no longer publicly available. Your invitation fallback remains ready." });
    } catch {
      setStatus({ kind: "failed", message: "The privacy setting could not be changed right now. Please try again." });
    } finally { setBusy(false); }
  };

  return (
    <div className="share-centre-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="share-centre" role="dialog" aria-modal="true" aria-labelledby="share-centre-title" aria-describedby="share-centre-description" ref={dialogRef} data-share-centre data-share-edition={activeProjection.edition} data-share-surface={activeProjection.surface} data-share-mode={activeProjection.personalised ? "personalised" : "generic"} data-media-ready={mediaReady}>
        <header className="share-centre-heading">
          <div><p className="share-centre-kicker">Pass the culture spark on</p><h2 id="share-centre-title">Share Centre</h2></div>
          <button type="button" className="share-centre-close" onClick={onClose} aria-label="Close Share Centre" ref={closeRef}>×</button>
        </header>
        <p id="share-centre-description" className="share-centre-description">Choose a platform, copy your safe link, or save a polished story portrait.</p>
        <p className="share-centre-safeguard">{PRODUCT_SAFEGUARD}</p>
        <div className="share-centre-link-mode">
          <b>{activeProjection.canonicalUrl.includes("/result/") ? "Permanent public result" : activeProjection.personalised ? "Verified personalised challenge" : "Regional invitation fallback"}</b>
          <span>{activeProjection.canonicalUrl.includes("/result/") ? "This public page uses the neutral identity A challenger, your authoritative score, approved avatar and regional edition." : activeProjection.personalised ? "Your approved name, verified score and regional edition match the challenge landing page." : "Durable challenges are unavailable, so this link carries no invented inviter identity or score."}</span>
        </div>
        {resultPublicationClient && <section className="result-publication-choice" data-result-publication data-publication-visibility={publicationVisibility} aria-labelledby="result-publication-title">
          <h3 id="result-publication-title">{publicationVisibility === "public" ? "Permanent result is public" : "Make this result public?"}</h3>
          {publicationVisibility === "private" ? <><p>Only continue if you want a permanent page and social preview. It may show:</p><ul>{RESULT_PUBLICATION_DISCLOSURE.map((item) => <li key={item}>{item}</li>)}</ul><p>Your entered name and private uploaded photo are excluded.</p><div><button type="button" onClick={publishResult} disabled={busy}>Make result public</button><button type="button" onClick={() => setStatus({ kind: "cancelled", message: "Result kept private. The existing invitation fallback remains available." })} disabled={busy}>Keep private</button></div></> : <><p>The permanent link now powers Facebook, WhatsApp, Copy link and Native share. You can reverse this choice.</p><button type="button" onClick={unpublishResult} disabled={busy}>Unpublish result</button></>}
        </section>}
        <div className="share-centre-grid" aria-label="Sharing options">
          <button type="button" onClick={() => openExternal("whatsapp", whatsappShareDestination(copy))} disabled={busy}><span aria-hidden="true">◉</span><b>WhatsApp</b><small>Full challenge copy</small></button>
          <button type="button" onClick={() => openExternal("facebook", facebookShareDestination(activeProjection))} disabled={busy}><span aria-hidden="true">f</span><b>Facebook</b><small>Open share composer</small></button>
          <button type="button" onClick={() => shareToVisualPlatform("instagram")} disabled={busy || !mediaReady}><span aria-hidden="true">◎</span><b>Instagram Story</b><small>{mediaReady ? "Story portrait handoff" : "Preparing portrait…"}</small></button>
          <button type="button" onClick={() => shareToVisualPlatform("tiktok")} disabled={busy || !mediaReady}><span aria-hidden="true">♪</span><b>TikTok</b><small>{mediaReady ? "Story portrait handoff" : "Preparing portrait…"}</small></button>
          <button type="button" onClick={copyLink} disabled={busy}><span aria-hidden="true">⧉</span><b>Copy link</b><small>Canonical safe URL</small></button>
          <button type="button" onClick={nativeShare} disabled={busy}><span aria-hidden="true">↗</span><b>Native share</b><small>Your device share menu</small></button>
          <button type="button" onClick={download} disabled={busy || !mediaReady}><span aria-hidden="true">↓</span><b>Download portrait</b><small>{mediaReady ? "1080 × 1920 PNG" : "Preparing portrait…"}</small></button>
          {storyProjection && <button type="button" className="story-video-launch" onClick={() => setStoryVideoOpen(true)} disabled={busy}><span aria-hidden="true">▶</span><b>Create Story video</b><small>Five-second 9:16 reveal</small></button>}
        </div>
        {storyVideoOpen && storyProjection && <StoryVideoPanel projection={storyProjection} surface={activeProjection.surface} soundEnabled={soundEnabled} onUseStatic={useStaticStory} />}
        <div className={`share-centre-status is-${status.kind}`} role="status" aria-live="polite" aria-atomic="true">
          <p>{status.message}</p>
          {status.instructions && <ol aria-label="Manual platform steps">{status.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol>}
          {status.manualText && <textarea readOnly value={status.manualText} aria-label="Manual safe link" onFocus={(event) => event.currentTarget.select()} />}
        </div>
        <details className="share-centre-limitations">
          <summary>How platform sharing works</summary>
          <p>WhatsApp opens with the full safe copy. Facebook receives the canonical link; public result links use their generated regional preview, while challenge and fallback links retain the approved site preview. When Story video is enabled, supported browsers can create a local five-second file for the device share sheet. Instagram, TikTok and Facebook cannot be targeted or verified by this browser. No app login, contact list, delivery receipt or selected recipient is visible to this game.</p>
        </details>
        <p className="share-centre-privacy">Private photos are re-encoded locally and appear only in the existing portrait you deliberately download or hand to your device share sheet. Story video always uses an approved avatar instead. Photos never enter public links, preview metadata or generated video.</p>
      </div>
    </div>
  );
}
