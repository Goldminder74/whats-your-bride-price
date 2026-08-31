"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isNativeShareCancellation } from "./nominationExperience";
import {
  STORY_VIDEO_DURATION_MS,
  STORY_VIDEO_HEIGHT,
  STORY_VIDEO_MAX_BYTES,
  STORY_VIDEO_WIDTH,
  STORY_STATIC_MIME,
  StoryVideoError,
  downloadStoryMedia,
  drawStoryVideoFrame,
  loadStoryVideoAssets,
  prepareStoryStatic,
  recordStoryVideo,
  selectStoryVideoMime,
  type PreparedStoryVideo,
  type StoryVideoAssets,
  type StoryVideoPhase,
} from "./storyVideo";
import { emitStoryVideoEvent, type StoryVideoChannel, type StoryVideoState } from "./storyVideoEvents";
import type { StoryVideoProjection } from "./storyVideoProjection";
import type { ShareSurface } from "./shareProjection";

type PanelStatus = Readonly<{ state: StoryVideoState; message: string; instructions?: readonly string[] }>;
const phaseLabels: Readonly<Record<StoryVideoPhase, string>> = Object.freeze({ regional_reveal: "Revealing your region", avatar_score: "Bringing in your avatar and score", result_reveal: "Revealing your result", final_hold: "Holding your final Story card" });

export default function StoryVideoPanel({
  projection,
  surface,
  soundEnabled,
  onUseStatic,
  entitlement,
  forceUnsupported = false,
}: Readonly<{
  projection: StoryVideoProjection;
  surface: ShareSurface;
  soundEnabled: boolean;
  onUseStatic: () => Promise<void>;
  entitlement?: unknown;
  forceUnsupported?: boolean;
}>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const assetsRef = useRef<StoryVideoAssets | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [status, setStatus] = useState<PanelStatus>({ state: "preview", message: "Previewing the five-second Story. Nothing is uploaded." });
  const [progress, setProgress] = useState(0);
  const [video, setVideo] = useState<PreparedStoryVideo | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoPoster, setVideoPoster] = useState<string | null>(null);
  const [videoPlayable, setVideoPlayable] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const supportedMime = useMemo(() => forceUnsupported ? null : selectStoryVideoMime(typeof MediaRecorder === "function" ? MediaRecorder.isTypeSupported.bind(MediaRecorder) : undefined), [forceUnsupported]);

  const emit = (name: Parameters<typeof emitStoryVideoEvent>[0]["name"], state: StoryVideoState, channel?: StoryVideoChannel, elapsedMs?: number, byteSize?: number) => emitStoryVideoEvent({ name, edition: projection.edition, surface, state, ...(channel ? { channel } : {}), ...(elapsedMs === undefined ? {} : { elapsedMs }), ...(byteSize === undefined ? {} : { byteSize }) });

  useEffect(() => {
    emit("story_video_open", "preview");
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener?.("change", update);
    let frame = 0; let cancelled = false; const startedAt = performance.now();
    void loadStoryVideoAssets(projection).then((assets) => {
      if (cancelled) return;
      assetsRef.current = assets; setAssetsReady(true);
      const canvas = canvasRef.current; const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      const render = () => {
        if (cancelled || !assetsRef.current) return;
        const elapsed = media.matches ? STORY_VIDEO_DURATION_MS : (performance.now() - startedAt) % STORY_VIDEO_DURATION_MS;
        drawStoryVideoFrame(context, projection, assetsRef.current, elapsed, media.matches);
        if (!media.matches) frame = requestAnimationFrame(render);
      };
      render();
    }).catch(() => setStatus({ state: "failed", message: "The Story preview could not be prepared. Your static portrait and link remain available." }));
    return () => {
      cancelled = true; cancelAnimationFrame(frame); media.removeEventListener?.("change", update); abortRef.current?.abort();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
    // The validated projection is fixed for this mounted panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    const canvas = canvasRef.current; const context = canvas?.getContext("2d"); const assets = assetsRef.current;
    if (!canvas || !context || !assets || !assetsReady) return;
    if (!supportedMime) {
      setStatus({ state: "unsupported", message: "This browser cannot record a Story video. The polished static 9:16 result remains available." });
      emit("story_video_render_failed", "unsupported");
      return;
    }
    abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller;
    setVideo(null); setVideoUrl(null); setVideoPoster(null); setVideoPlayable(false); setProgress(0); setStatus({ state: "rendering", message: phaseLabels.regional_reveal });
    const startedAt = performance.now(); emit("story_video_render_start", "rendering");
    try {
      const prepared = await recordStoryVideo({ canvas, context, projection, assets, soundEnabled, entitlement, signal: controller.signal, onProgress: (next, phase) => { setProgress(next); setStatus({ state: "rendering", message: phaseLabels[phase] }); } });
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(prepared.blob); objectUrlRef.current = url; setVideo(prepared); setVideoUrl(url);
      try { setVideoPoster(canvas.toDataURL(STORY_STATIC_MIME)); } catch { setVideoPoster(null); }
      setProgress(1);
      setStatus({ state: "ready", message: `Your ${prepared.extension.toUpperCase()} Story video is ready on this device. Nothing has been posted.` });
      emit("story_video_render_complete", "ready", undefined, performance.now() - startedAt, prepared.byteSize);
    } catch (error) {
      const code = error instanceof StoryVideoError ? error.code : "recording_failed";
      const cancelled = code === "cancelled";
      setStatus({ state: cancelled ? "cancelled" : code === "unsupported" ? "unsupported" : "failed", message: cancelled ? "Video generation cancelled. Your static portrait and link are still available." : code === "file_too_large" ? "The video exceeded the safe 8 MB limit. Use the static Story image instead." : "Video generation did not finish. Use the static Story image or try again." });
      emit("story_video_render_failed", cancelled ? "cancelled" : code === "unsupported" ? "unsupported" : "failed", undefined, performance.now() - startedAt);
    }
  };

  const downloadExistingStatic = async () => {
    emit("story_static_fallback", "fallback", "static");
    try { await onUseStatic(); setStatus({ state: "fallback", message: "Your static 9:16 Story image download started. It remains available even when video is unsupported." }); }
    catch { setStatus({ state: "failed", message: "The static Story image could not be prepared. Your active public or invitation link remains available until its server-authoritative expiry." }); }
  };

  const downloadVideo = () => {
    if (!video) return;
    downloadStoryMedia(video); emit("story_video_download", "ready", "download", undefined, video.byteSize);
    setStatus({ state: "ready", message: `Your ${video.extension.toUpperCase()} download started. Upload it from your device when you choose.` });
  };

  const shareVideo = async (channel: Exclude<StoryVideoChannel, "download" | "static">) => {
    if (!video) return;
    emit("story_video_share_intent", "ready", channel, undefined, video.byteSize);
    const label = channel === "facebook_story" ? "Facebook Story" : channel[0].toUpperCase() + channel.slice(1);
    if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function" || !navigator.canShare({ files: [video.file] })) {
      downloadStoryMedia(video); emit("story_video_download", "ready", "download", undefined, video.byteSize);
      setStatus({ state: "ready", message: `${label} cannot receive a video directly from this browser, so the correctly labelled file was downloaded.`, instructions: [`Open ${label} on your device.`, `Choose ${video.filename} from your files.`] });
      return;
    }
    try {
      await navigator.share({ title: `${projection.editionLabel} culture result`, text: projection.safeguard, files: [video.file] });
      emit("story_video_share_handoff", "ready", channel, undefined, video.byteSize);
      setStatus({ state: "ready", message: `The device share sheet completed its handoff. Choose ${label} there; the game cannot confirm posting or delivery.` });
    } catch (error) {
      setStatus(isNativeShareCancellation(error)
        ? { state: "cancelled", message: "Sharing cancelled. No handoff or publication is counted." }
        : { state: "failed", message: "The share sheet could not complete. Download the video and upload it from your device instead." });
    }
  };

  const downloadSafeStatic = async () => {
    const canvas = canvasRef.current; const context = canvas?.getContext("2d"); const assets = assetsRef.current;
    if (!canvas || !context || !assets) return downloadExistingStatic();
    drawStoryVideoFrame(context, projection, assets, STORY_VIDEO_DURATION_MS, true);
    try { const media = await prepareStoryStatic(canvas, projection); downloadStoryMedia(media); emit("story_static_fallback", "fallback", "static", undefined, media.blob.size); setStatus({ state: "fallback", message: "A private, approved-avatar static Story image was downloaded. No private photo was used." }); }
    catch { await downloadExistingStatic(); }
  };

  return <section className="story-video-panel" aria-labelledby="story-video-title" data-story-video data-story-video-state={status.state} data-reduced-motion={reducedMotion} data-supported-mime={supportedMime?.mimeType || "none"} data-video-mime={video?.mimeType || ""} data-video-size={video?.byteSize || 0} data-video-duration={video ? Math.round(video.durationMs) : 0} data-audio-included={video?.audioIncluded || false}>
    <header><div><p>Five-second result reveal</p><h3 id="story-video-title">Create Story video</h3></div><span aria-hidden="true">9:16</span></header>
    <div className="story-video-preview">
      <canvas ref={canvasRef} width={STORY_VIDEO_WIDTH} height={STORY_VIDEO_HEIGHT} aria-label={`${projection.editionLabel} animated result preview showing ${projection.score} out of ${projection.maximumScore}`} />
      {/* Generated audio is an abstract drum flourish with no speech to caption. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      {videoUrl && <video className={videoPlayable ? "is-playable" : ""} controls playsInline preload="metadata" src={videoUrl} poster={videoPoster || undefined} onLoadedMetadata={(event) => { const media = event.currentTarget; media.currentTime = Math.max(0, Math.min(STORY_VIDEO_DURATION_MS / 1000 - .08, media.duration - .08)); }} onCanPlay={() => setVideoPlayable(true)} aria-label="Generated five-second Story video preview" />}
    </div>
    <p className="story-video-safeguard">{projection.safeguard}</p>
    {reducedMotion && !video && <p className="story-video-motion-note">Motion is paused for your preference. The static final frame is shown. Video generation starts only if you choose it.</p>}
    {status.state === "rendering" && <div className="story-video-progress"><label htmlFor="story-video-progress">{status.message}</label><progress id="story-video-progress" max={1} value={progress}>{Math.round(progress * 100)}%</progress><button type="button" onClick={() => abortRef.current?.abort()}>Cancel generation</button></div>}
    {status.state !== "rendering" && <div className="story-video-actions">
      {!video && <button type="button" className="story-video-primary" onClick={() => void generate()} disabled={!assetsReady}>{assetsReady ? "Generate five-second video" : "Preparing preview…"}</button>}
      {video && <><button type="button" className="story-video-primary" onClick={() => void shareVideo("native")}>Share video</button><button type="button" onClick={downloadVideo}>Download video</button><button type="button" onClick={() => void shareVideo("instagram")}>Instagram instructions</button><button type="button" onClick={() => void shareVideo("tiktok")}>TikTok instructions</button><button type="button" onClick={() => void shareVideo("facebook_story")}>Facebook Story instructions</button><button type="button" onClick={() => void shareVideo("whatsapp")}>WhatsApp sharing</button></>}
      <button type="button" onClick={() => void downloadSafeStatic()}>Use static Story image instead</button>
    </div>}
    <div className={`story-video-status is-${status.state}`} role="status" aria-live="polite" aria-atomic="true"><p>{status.message}</p>{status.instructions && <ol>{status.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol>}{video && <small>{video.width} × {video.height} • {(video.durationMs / 1000).toFixed(1)} seconds • {(video.byteSize / 1_000_000).toFixed(2)} MB • {video.mimeType} • limit {(STORY_VIDEO_MAX_BYTES / 1_000_000).toFixed(0)} MB</small>}</div>
    <p className="story-video-honesty">The game uses approved regional artwork and avatar only. It does not upload this media, target a specific app, or claim that a post was published.</p>
  </section>;
}
