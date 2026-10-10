import { activeFeatureFlags } from "./featureFlags.ts";
import { requireRoyalRevealProjection } from "./royalRevealProjection.ts";
import { isStoryVideoProjection, type StoryVideoProjection } from "./storyVideoProjection.ts";

export const STORY_VIDEO_WIDTH = 1080;
export const STORY_VIDEO_HEIGHT = 1920;
export const STORY_VIDEO_DURATION_MS = 5000;
export const STORY_VIDEO_FPS = 30;
export const STORY_VIDEO_MAX_BYTES = 8_000_000;
export const STORY_STATIC_MIME = "image/png";

export const storyVideoMimeCandidates = Object.freeze([
  Object.freeze({ mimeType: "video/mp4;codecs=avc1.42E01E", extension: "mp4" }),
  Object.freeze({ mimeType: "video/mp4", extension: "mp4" }),
  Object.freeze({ mimeType: "video/webm;codecs=vp9", extension: "webm" }),
  Object.freeze({ mimeType: "video/webm;codecs=vp8", extension: "webm" }),
  Object.freeze({ mimeType: "video/webm", extension: "webm" }),
] as const);

export type StoryVideoMime = (typeof storyVideoMimeCandidates)[number];
export type StoryVideoPhase = "regional_reveal" | "avatar_score" | "result_reveal" | "final_hold";
export type StoryVideoAssets = Readonly<{ regionalArtwork: CanvasImageSource; avatar: CanvasImageSource }>;
export type PreparedStoryVideo = Readonly<{
  blob: Blob;
  file: File;
  mimeType: string;
  extension: "mp4" | "webm";
  filename: string;
  width: typeof STORY_VIDEO_WIDTH;
  height: typeof STORY_VIDEO_HEIGHT;
  durationMs: number;
  byteSize: number;
  audioIncluded: boolean;
}>;
export type PreparedStoryStatic = Readonly<{ blob: Blob; file: File; filename: string; width: 1080; height: 1920; mimeType: "image/png" }>;

export class StoryVideoError extends Error {
  readonly code: "unsupported" | "cancelled" | "recording_failed" | "file_too_large" | "invalid_projection";
  constructor(code: StoryVideoError["code"]) { super(code); this.name = "StoryVideoError"; this.code = code; }
}

export function storyVideoPhaseAt(elapsedMs: number): StoryVideoPhase {
  const elapsed = Math.max(0, Math.min(STORY_VIDEO_DURATION_MS, elapsedMs));
  if (elapsed < 800) return "regional_reveal";
  if (elapsed < 2400) return "avatar_score";
  if (elapsed < 3800) return "result_reveal";
  return "final_hold";
}

export function selectStoryVideoMime(
  isTypeSupported: ((mimeType: string) => boolean) | undefined,
): StoryVideoMime | null {
  if (typeof isTypeSupported !== "function") return null;
  return storyVideoMimeCandidates.find((candidate) => {
    try { return isTypeSupported(candidate.mimeType); } catch { return false; }
  }) || null;
}

export function storyVideoFilename(edition: StoryVideoProjection["edition"], extension: "mp4" | "webm"): string {
  return `bride-price-${edition}-story-video.${extension}`;
}

export function storyStaticFilename(edition: StoryVideoProjection["edition"]): string {
  return `bride-price-${edition}-story-static.png`;
}

function loadLocalImage(source: string): Promise<HTMLImageElement> {
  if (!/^\/[a-z0-9/_-]+\.(?:webp|png|svg)$/i.test(source)) return Promise.reject(new StoryVideoError("invalid_projection"));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new StoryVideoError("recording_failed"));
    image.src = source;
  });
}

export async function loadStoryVideoAssets(projection: StoryVideoProjection): Promise<StoryVideoAssets> {
  if (!isStoryVideoProjection(projection)) throw new StoryVideoError("invalid_projection");
  const [regionalArtwork, avatar] = await Promise.all([
    loadLocalImage(projection.regionalArtwork),
    loadLocalImage(projection.avatarAsset),
  ]);
  return Object.freeze({ regionalArtwork, avatar });
}

function easeOut(value: number): number { return 1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 3); }
function phaseProgress(elapsed: number, start: number, end: number): number { return easeOut((elapsed - start) / (end - start)); }

function cover(context: CanvasRenderingContext2D, image: CanvasImageSource, x: number, y: number, width: number, height: number): void {
  const source = image as CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
  const sourceWidth = source.naturalWidth || source.width || width;
  const sourceHeight = source.naturalHeight || source.height || height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  context.drawImage(image, (sourceWidth - cropWidth) / 2, (sourceHeight - cropHeight) / 2, cropWidth, cropHeight, x, y, width, height);
}

function fitText(context: CanvasRenderingContext2D, text: string, maximumWidth: number): string {
  if (context.measureText(text).width <= maximumWidth) return text;
  let value = text;
  while (value.length > 1 && context.measureText(`${value}…`).width > maximumWidth) value = value.slice(0, -1);
  return `${value}…`;
}

function cowrie(context: CanvasRenderingContext2D, x: number, y: number, size: number, accent: string): void {
  context.save();
  context.translate(x, y);
  context.strokeStyle = accent;
  context.lineWidth = Math.max(5, size * .055);
  context.beginPath(); context.ellipse(0, 0, size * .36, size * .5, 0, 0, Math.PI * 2); context.stroke();
  context.beginPath(); context.moveTo(0, -size * .34); context.bezierCurveTo(-size * .1, -size * .12, size * .1, size * .12, 0, size * .34); context.stroke();
  for (const side of [-1, 1]) for (let index = -2; index <= 2; index += 1) {
    context.beginPath(); context.moveTo(side * size * .05, index * size * .12); context.lineTo(side * size * .18, index * size * .16); context.stroke();
  }
  context.restore();
}

export function drawStoryVideoFrame(
  context: CanvasRenderingContext2D,
  projection: StoryVideoProjection,
  assets: StoryVideoAssets,
  elapsedMs: number,
  reducedMotion = false,
): StoryVideoPhase {
  if (!isStoryVideoProjection(projection)) throw new StoryVideoError("invalid_projection");
  const elapsed = reducedMotion ? STORY_VIDEO_DURATION_MS : Math.max(0, Math.min(STORY_VIDEO_DURATION_MS, elapsedMs));
  const phase = storyVideoPhaseAt(elapsed);
  const { base, accent, dark, mark } = projection.theme;
  context.clearRect(0, 0, STORY_VIDEO_WIDTH, STORY_VIDEO_HEIGHT);
  context.fillStyle = base; context.fillRect(0, 0, STORY_VIDEO_WIDTH, STORY_VIDEO_HEIGHT);
  context.save(); context.globalAlpha = .58; cover(context, assets.regionalArtwork, 0, 0, STORY_VIDEO_WIDTH, STORY_VIDEO_HEIGHT); context.restore();
  const veil = context.createLinearGradient(0, 0, 0, STORY_VIDEO_HEIGHT);
  veil.addColorStop(0, `${dark}aa`); veil.addColorStop(.5, `${dark}e8`); veil.addColorStop(1, dark);
  context.fillStyle = veil; context.fillRect(0, 0, STORY_VIDEO_WIDTH, STORY_VIDEO_HEIGHT);
  context.globalAlpha = .16; context.strokeStyle = accent; context.lineWidth = 10;
  for (let offset = -1500; offset < 1300; offset += 155) { context.beginPath(); context.moveTo(offset, 0); context.lineTo(offset + 1200, STORY_VIDEO_HEIGHT); context.stroke(); }
  context.globalAlpha = 1;

  const regional = reducedMotion ? 1 : phaseProgress(elapsed, 0, 800);
  context.save(); context.globalAlpha = regional; context.translate(0, (1 - regional) * 34);
  cowrie(context, 540, 155, 98, accent);
  context.textAlign = "center"; context.fillStyle = accent; context.font = "800 30px Arial";
  context.fillText("WHAT’S YOUR BRIDE PRICE?", 540, 290);
  context.fillStyle = "#fff4df"; context.font = "900 76px Impact, Arial Black, Arial";
  context.fillText(`${projection.editionLabel.toUpperCase()} EDITION`, 540, 390);
  context.restore();

  const avatarProgress = reducedMotion ? 1 : phaseProgress(elapsed, 800, 1750);
  const avatarSize = 390 * (.76 + avatarProgress * .24);
  context.save(); context.globalAlpha = avatarProgress; context.translate(540, 690 + (1 - avatarProgress) * 80); context.scale(avatarSize / 390, avatarSize / 390);
  context.beginPath(); context.arc(0, 0, 195, 0, Math.PI * 2); context.clip(); cover(context, assets.avatar, -195, -195, 390, 390); context.restore();
  context.save(); context.globalAlpha = avatarProgress; context.strokeStyle = accent; context.lineWidth = 18; context.beginPath(); context.arc(540, 690 + (1 - avatarProgress) * 80, avatarSize / 2 + 8, 0, Math.PI * 2); context.stroke(); context.restore();

  const scoreProgress = reducedMotion ? 1 : phaseProgress(elapsed, 1050, 2400);
  const shownScore = Math.round(projection.score * scoreProgress);
  context.save(); context.globalAlpha = scoreProgress; context.textAlign = "center";
  context.fillStyle = "#fff4df"; context.font = "900 218px Impact, Arial Black, Arial"; context.fillText(`${shownScore}/${projection.maximumScore}`, 540, 1160);
  context.fillStyle = accent; context.font = "800 28px Arial"; context.fillText("CULTURE KNOWLEDGE SCORE", 540, 1220); context.restore();

  const resultProgress = reducedMotion ? 1 : phaseProgress(elapsed, 2400, 3550);
  context.save(); context.globalAlpha = resultProgress; context.textAlign = "center"; context.translate(0, (1 - resultProgress) * 45);
  context.fillStyle = accent; context.font = "900 94px Impact, Arial Black, Arial";
  context.fillText(fitText(context, projection.resultTitle.toUpperCase(), 870), 540, 1370);
  if (projection.mastery) { context.fillStyle = "#fff4df"; context.font = "800 34px Arial"; context.fillText(`${mark} REGIONAL MASTERY ${mark}`, 540, 1440); }
  context.restore();

  if (projection.score >= 9 && (reducedMotion || elapsed >= 2600)) {
    const celebration = reducedMotion ? 1 : phaseProgress(elapsed, 2600, 3800);
    context.save(); context.globalAlpha = .8 * celebration; context.fillStyle = accent;
    for (let index = 0; index < 26; index += 1) {
      const x = 55 + ((index * 173) % 970); const y = 520 + ((index * 241) % 960); const size = 6 + (index % 4) * 3;
      context.save(); context.translate(x, y); context.rotate(index * .71); context.fillRect(-size, -size * 2, size * 2, size * 4); context.restore();
    }
    context.restore();
  }

  const finalProgress = reducedMotion ? 1 : phaseProgress(elapsed, 3600, 4300);
  context.save(); context.globalAlpha = finalProgress; context.textAlign = "center";
  context.fillStyle = `${dark}ee`; context.fillRect(72, 1545, 936, 260);
  context.strokeStyle = accent; context.lineWidth = 4; context.strokeRect(90, 1563, 900, 224);
  context.fillStyle = "#fff4df"; context.font = "700 29px Arial";
  context.fillText("A playful culture score, never a measure", 540, 1650);
  context.fillText("of human worth.", 540, 1694);
  context.fillStyle = accent; context.font = "800 24px Arial";
  context.fillText("CLASSES FOR CULTURE  •  BRIDEPRICE.CLASSESFORCULTURE.COM", 540, 1760);
  context.restore();
  return phase;
}

export async function prepareStoryStatic(canvas: HTMLCanvasElement, projection: StoryVideoProjection): Promise<PreparedStoryStatic> {
  if (canvas.width !== STORY_VIDEO_WIDTH || canvas.height !== STORY_VIDEO_HEIGHT || !isStoryVideoProjection(projection)) throw new StoryVideoError("invalid_projection");
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, STORY_STATIC_MIME));
  if (!blob || blob.type !== STORY_STATIC_MIME) throw new StoryVideoError("recording_failed");
  const filename = storyStaticFilename(projection.edition);
  return Object.freeze({ blob, file: new File([blob], filename, { type: STORY_STATIC_MIME, lastModified: Date.now() }), filename, width: STORY_VIDEO_WIDTH, height: STORY_VIDEO_HEIGHT, mimeType: STORY_STATIC_MIME });
}

type AudioCapture = Readonly<{ track: MediaStreamTrack; close: () => Promise<void> }>;
async function createGeneratedAudio(enabled: boolean): Promise<AudioCapture | null> {
  if (!enabled || typeof AudioContext !== "function") return null;
  try {
    const context = new AudioContext();
    await context.resume();
    const destination = context.createMediaStreamDestination();
    const now = context.currentTime;
    [0.9, 1.25, 1.55, 1.82, 2.05, 2.28, 2.7, 3.18].forEach((offset, index) => {
      const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.type = index % 2 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(72 + (index % 3) * 20, now + offset);
      gain.gain.setValueAtTime(.0001, now + offset); gain.gain.exponentialRampToValueAtTime(.12, now + offset + .015); gain.gain.exponentialRampToValueAtTime(.0001, now + offset + .18);
      oscillator.connect(gain).connect(destination); oscillator.start(now + offset); oscillator.stop(now + offset + .2);
    });
    const track = destination.stream.getAudioTracks()[0];
    return track ? Object.freeze({ track, close: async () => { track.stop(); await context.close(); } }) : null;
  } catch { return null; }
}

export function downloadStoryMedia(media: Pick<PreparedStoryVideo | PreparedStoryStatic, "blob" | "filename">): void {
  const url = URL.createObjectURL(media.blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = media.filename; anchor.rel = "noopener"; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function recordStoryVideo(input: Readonly<{
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  projection: StoryVideoProjection;
  assets: StoryVideoAssets;
  soundEnabled: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: number, phase: StoryVideoPhase) => void;
  entitlement?: unknown;
}>): Promise<PreparedStoryVideo> {
  if (activeFeatureFlags.commerce) requireRoyalRevealProjection(input.entitlement);
  if (!isStoryVideoProjection(input.projection) || input.canvas.width !== STORY_VIDEO_WIDTH || input.canvas.height !== STORY_VIDEO_HEIGHT) throw new StoryVideoError("invalid_projection");
  const capture = input.canvas.captureStream?.bind(input.canvas);
  const mime = selectStoryVideoMime(typeof MediaRecorder === "function" ? MediaRecorder.isTypeSupported.bind(MediaRecorder) : undefined);
  if (!capture || typeof MediaRecorder !== "function" || !mime) throw new StoryVideoError("unsupported");
  if (input.signal?.aborted) throw new StoryVideoError("cancelled");
  const canvasStream = capture(STORY_VIDEO_FPS);
  const audio = await createGeneratedAudio(input.soundEnabled);
  const tracks = [...canvasStream.getVideoTracks(), ...(audio ? [audio.track] : [])];
  const stream = new MediaStream(tracks);
  const chunks: Blob[] = [];
  let recorder: MediaRecorder;
  try { recorder = new MediaRecorder(stream, { mimeType: mime.mimeType, videoBitsPerSecond: 1_800_000 }); }
  catch { stream.getTracks().forEach((track) => track.stop()); await audio?.close(); throw new StoryVideoError("unsupported"); }
  const startedAt = performance.now();
  let animationFrame = 0;
  let settled = false;
  const stopTracks = async () => { stream.getTracks().forEach((track) => track.stop()); canvasStream.getTracks().forEach((track) => track.stop()); await audio?.close(); };
  return new Promise<PreparedStoryVideo>((resolve, reject) => {
    const fail = async (code: StoryVideoError["code"]) => {
      if (settled) return; settled = true; cancelAnimationFrame(animationFrame);
      try { if (recorder.state !== "inactive") recorder.stop(); } catch { /* cleanup below */ }
      await stopTracks(); reject(new StoryVideoError(code));
    };
    const abort = () => { void fail("cancelled"); };
    input.signal?.addEventListener("abort", abort, { once: true });
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => { void fail("recording_failed"); };
    recorder.onstop = async () => {
      if (settled) return;
      settled = true; cancelAnimationFrame(animationFrame); input.signal?.removeEventListener("abort", abort); await stopTracks();
      const blob = new Blob(chunks, { type: mime.mimeType });
      if (!blob.size) { reject(new StoryVideoError("recording_failed")); return; }
      if (blob.size > STORY_VIDEO_MAX_BYTES) { reject(new StoryVideoError("file_too_large")); return; }
      const durationMs = performance.now() - startedAt;
      const filename = storyVideoFilename(input.projection.edition, mime.extension);
      resolve(Object.freeze({ blob, file: new File([blob], filename, { type: mime.mimeType, lastModified: Date.now() }), mimeType: mime.mimeType, extension: mime.extension, filename, width: STORY_VIDEO_WIDTH, height: STORY_VIDEO_HEIGHT, durationMs, byteSize: blob.size, audioIncluded: Boolean(audio) }));
    };
    const frame = () => {
      if (settled) return;
      const elapsed = Math.min(STORY_VIDEO_DURATION_MS, performance.now() - startedAt);
      const phase = drawStoryVideoFrame(input.context, input.projection, input.assets, elapsed);
      input.onProgress?.(elapsed / STORY_VIDEO_DURATION_MS, phase);
      if (elapsed >= STORY_VIDEO_DURATION_MS) { try { recorder.stop(); } catch { void fail("recording_failed"); } return; }
      animationFrame = requestAnimationFrame(frame);
    };
    try { drawStoryVideoFrame(input.context, input.projection, input.assets, 0); recorder.start(250); animationFrame = requestAnimationFrame(frame); }
    catch { void fail("recording_failed"); }
  });
}
