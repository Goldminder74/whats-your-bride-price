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

type ShareCentreProps = Readonly<{
  projection: SafeShareProjection;
  prepareMedia: () => Promise<PreparedShareMedia>;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
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

export default function ShareCentre({ projection, prepareMedia, onClose, returnFocusRef }: ShareCentreProps) {
  const copy = useMemo(() => buildShareCopy(projection), [projection]);
  const [status, setStatus] = useState<ShareStatus>(idleStatus);
  const [busy, setBusy] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const mediaPromiseRef = useRef<Promise<PreparedShareMedia> | null>(null);
  const preparedMediaRef = useRef<PreparedShareMedia | null>(null);
  const mediaPreparedEventRef = useRef(false);
  const actionLockRef = useRef(false);

  const record = (name: Parameters<typeof emitShareCentreEvent>[0]["name"], channel?: ShareCentreChannel, startedAt?: number) => {
    emitShareCentreEvent({
      name,
      surface: projection.surface,
      channel,
      edition: projection.edition,
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
      await navigator.clipboard.writeText(projection.canonicalUrl);
      record("share_copy_succeeded", channel);
      setStatus({ kind: "success", message: `${failedMessage} The safe link was copied instead.` });
    } catch {
      record("share_failed", channel);
      setStatus({ kind: "failed", message: `${failedMessage} Select and copy the safe link below.`, manualText: projection.canonicalUrl });
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
    const data: ShareData = { title: copy.title, text: `${copy.sentence}\n${PRODUCT_SAFEGUARD}`, url: projection.canonicalUrl };
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
      await navigator.clipboard.writeText(projection.canonicalUrl);
      record("share_copy_succeeded", "copy", startedAt);
      setStatus({ kind: "success", message: "Safe link copied. Paste it where you choose; delivery is not claimed." });
    } catch {
      record("share_failed", "copy", startedAt);
      setStatus({ kind: "failed", message: "Clipboard access is unavailable. Select and copy the safe link below.", manualText: projection.canonicalUrl });
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

  return (
    <div className="share-centre-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="share-centre" role="dialog" aria-modal="true" aria-labelledby="share-centre-title" aria-describedby="share-centre-description" ref={dialogRef} data-share-centre data-share-surface={projection.surface} data-share-mode={projection.personalised ? "personalised" : "generic"} data-media-ready={mediaReady}>
        <header className="share-centre-heading">
          <div><p className="share-centre-kicker">Pass the culture spark on</p><h2 id="share-centre-title">Share Centre</h2></div>
          <button type="button" className="share-centre-close" onClick={onClose} aria-label="Close Share Centre" ref={closeRef}>×</button>
        </header>
        <p id="share-centre-description" className="share-centre-description">Choose a platform, copy your safe link, or save a polished story portrait.</p>
        <p className="share-centre-safeguard">{PRODUCT_SAFEGUARD}</p>
        <div className="share-centre-link-mode">
          <b>{projection.personalised ? "Verified personalised challenge" : "Regional invitation fallback"}</b>
          <span>{projection.personalised ? "Your approved name, verified score and regional edition match the challenge landing page." : "Durable challenges are unavailable, so this link carries no invented inviter identity or score."}</span>
        </div>
        <div className="share-centre-grid" aria-label="Sharing options">
          <button type="button" onClick={() => openExternal("whatsapp", whatsappShareDestination(copy))} disabled={busy}><span aria-hidden="true">◉</span><b>WhatsApp</b><small>Full challenge copy</small></button>
          <button type="button" onClick={() => openExternal("facebook", facebookShareDestination(projection))} disabled={busy}><span aria-hidden="true">f</span><b>Facebook</b><small>Open share composer</small></button>
          <button type="button" onClick={() => shareToVisualPlatform("instagram")} disabled={busy || !mediaReady}><span aria-hidden="true">◎</span><b>Instagram Story</b><small>{mediaReady ? "Story portrait handoff" : "Preparing portrait…"}</small></button>
          <button type="button" onClick={() => shareToVisualPlatform("tiktok")} disabled={busy || !mediaReady}><span aria-hidden="true">♪</span><b>TikTok</b><small>{mediaReady ? "Story portrait handoff" : "Preparing portrait…"}</small></button>
          <button type="button" onClick={copyLink} disabled={busy}><span aria-hidden="true">⧉</span><b>Copy link</b><small>Canonical safe URL</small></button>
          <button type="button" onClick={nativeShare} disabled={busy}><span aria-hidden="true">↗</span><b>Native share</b><small>Your device share menu</small></button>
          <button type="button" onClick={download} disabled={busy || !mediaReady}><span aria-hidden="true">↓</span><b>Download portrait</b><small>{mediaReady ? "1080 × 1920 PNG" : "Preparing portrait…"}</small></button>
        </div>
        <div className={`share-centre-status is-${status.kind}`} role="status" aria-live="polite" aria-atomic="true">
          <p>{status.message}</p>
          {status.instructions && <ol aria-label="Manual platform steps">{status.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol>}
          {status.manualText && <textarea readOnly value={status.manualText} aria-label="Manual safe link" onFocus={(event) => event.currentTarget.select()} />}
        </div>
        <details className="share-centre-limitations">
          <summary>How platform sharing works</summary>
          <p>WhatsApp opens with the full safe copy. Facebook receives the canonical link and currently uses the site’s static preview image. Instagram and TikTok do not offer reliable browser targeting, so the device share sheet or a private image download is used. No app login, contact list, delivery receipt or selected recipient is visible to this game.</p>
        </details>
        <p className="share-centre-privacy">Private photos are re-encoded locally and appear only in media you deliberately download or hand to your device share sheet. They never enter public links or preview metadata.</p>
      </div>
    </div>
  );
}
