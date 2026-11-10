import { muxResultMp4, type AvcSample } from "../paid/mp4Mux.ts";
import type { ResultVideoStory } from "../paid/resultVideo.ts";

type Story = ResultVideoStory;

function beatLines(story: Story, seconds: number): string[] {
  const beat = [...story.beats].reverse().find((item) => seconds >= item.start) ?? story.beats[0];
  return beat?.lines ?? [];
}

function drawFrame(context: CanvasRenderingContext2D, story: Story, seconds: number): void {
  const { width, height, safe } = story;
  context.fillStyle = "#211744";
  context.fillRect(0, 0, width, height);
  const glow = context.createRadialGradient(width / 2, height * 0.3, 40, width / 2, height * 0.4, height * 0.6);
  glow.addColorStop(0, "#7141a3b3");
  glow.addColorStop(1, "#21174400");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
  const boxTop = safe.top;
  const boxHeight = height - safe.bottom - safe.top;
  context.strokeStyle = "#f0a11a";
  context.lineWidth = 8;
  context.strokeRect(safe.side, boxTop, width - safe.side * 2, boxHeight);
  context.strokeStyle = "#fff6d8";
  context.lineWidth = 2;
  context.strokeRect(safe.side + 16, boxTop + 16, width - (safe.side + 16) * 2, boxHeight - 32);
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  const lines = beatLines(story, seconds);
  lines.forEach((line, index) => {
    context.fillStyle = index % 2 === 0 ? "#f0a11a" : "#fff6d8";
    context.font = `${index === 0 ? 92 : 64}px Anton, Impact, Arial Black, sans-serif`;
    context.fillText(line, width / 2, boxTop + 200 + index * 140, width - safe.side * 2 - 40);
  });
  context.fillStyle = "#fff6d8";
  context.font = "28px Anton, Impact, Arial Black, sans-serif";
  context.fillText("A PLAYFUL CULTURE SCORE", width / 2, height - safe.bottom - 48);
}

async function encodeWithWebCodecs(story: Story): Promise<Blob | null> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = story.width;
  canvas.height = story.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const samples: AvcSample[] = [];
  let avcC: Uint8Array | null = null;
  let failed = false;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const description = meta?.decoderConfig?.description;
      if (description) avcC = new Uint8Array(description instanceof ArrayBuffer ? description : ArrayBuffer.isView(description) ? description.buffer.slice(description.byteOffset, description.byteOffset + description.byteLength) : description);
      samples.push({ data, key: chunk.type === "key" });
    },
    error: () => { failed = true; },
  });
  const codec = "avc1.640028";
  const support = await VideoEncoder.isConfigSupported({ codec, width: story.width, height: story.height, bitrate: 2_000_000, framerate: story.fps, avc: { format: "avc" } }).catch(() => ({ supported: false }));
  if (!support.supported) return null;
  encoder.configure({ codec, width: story.width, height: story.height, bitrate: 2_000_000, framerate: story.fps, avc: { format: "avc" }, latencyMode: "quality" });
  const frames = story.seconds * story.fps;
  for (let index = 0; index < frames; index += 1) {
    drawFrame(context, story, index / story.fps);
    const frame = new VideoFrame(canvas, { timestamp: Math.round(index * 1_000_000 / story.fps) });
    encoder.encode(frame, { keyFrame: index % story.fps === 0 });
    frame.close();
    if (failed) return null;
  }
  await encoder.flush();
  encoder.close();
  if (!avcC || samples.length !== frames) return null;
  const bytes = muxResultMp4({ width: story.width, height: story.height, fps: story.fps, seconds: story.seconds, samples, avcC });
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([copy], { type: "video/mp4" });
}

async function encodeWithRecorder(story: Story): Promise<Blob | null> {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = story.width;
  canvas.height = story.height;
  const context = canvas.getContext("2d");
  if (!context || !canvas.captureStream) return null;
  const mime = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4"].find((item) => MediaRecorder.isTypeSupported(item));
  if (!mime) return null;
  const stream = canvas.captureStream(story.fps);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_000_000 });
  const parts: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) parts.push(event.data); };
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  recorder.start();
  const frames = story.seconds * story.fps;
  for (let index = 0; index < frames; index += 1) {
    drawFrame(context, story, index / story.fps);
    await new Promise((resolve) => setTimeout(resolve, 1000 / story.fps));
  }
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());
  const blob = new Blob(parts, { type: "video/mp4" });
  return blob.size > 1000 ? blob : null;
}

function mp4Url(edition: string, score: number): string {
  return `/api/paid/result-video.mp4?edition=${encodeURIComponent(edition)}&score=${score}`;
}

async function serverMp4(edition: string, score: number): Promise<Blob | null> {
  const cached = await fetch(mp4Url(edition, score));
  if (!cached.ok) return null;
  const type = cached.headers.get("content-type") || "";
  if (!type.includes("video/mp4")) return null;
  const blob = await cached.blob();
  return blob.size > 1000 ? blob : null;
}

export async function buildResultVideo(input: { edition: string; score: number; referral: string | null }): Promise<Blob> {
  const ready = await serverMp4(input.edition, input.score);
  if (ready) return ready;
  const query = `edition=${encodeURIComponent(input.edition)}&score=${input.score}${input.referral ? `&ref=${encodeURIComponent(input.referral)}` : ""}`;
  const storyResponse = await fetch(`/api/paid/result-video?${query}`);
  if (!storyResponse.ok) throw new Error("video_unavailable");
  const story = await storyResponse.json() as Story;
  let encoded: Blob | null = null;
  try { encoded = await encodeWithWebCodecs(story); } catch { encoded = null; }
  if (!encoded) {
    try { encoded = await encodeWithRecorder(story); } catch { encoded = null; }
  }
  if (!encoded) throw new Error("video_unavailable");
  void fetch(mp4Url(input.edition, input.score), {
    method: "POST",
    headers: { "content-type": "video/mp4" },
    body: encoded,
  });
  return encoded;
}

export type ResultShare = { blob: Blob; filename: string; kind: "video" | "story" };

export type ShareNavigator = {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
};

export function clipMime(clip: ResultShare): string {
  return clip.kind === "video" ? "video/mp4" : "image/png";
}

export function clipFile(clip: ResultShare): File {
  return new File([clip.blob], clip.filename, { type: clipMime(clip) });
}

/** True only when this browser will accept the file in the share sheet. */
export function canShareClip(clip: ResultShare, nav: ShareNavigator = navigator): boolean {
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files: [clipFile(clip)] }) === true;
  } catch {
    return false;
  }
}

/**
 * Call this in the same turn as the tap. An await before it drops iOS user activation
 * and the share sheet never opens.
 */
export function shareClipNow(clip: ResultShare, text: string, nav: ShareNavigator = navigator): Promise<void> | null {
  if (!canShareClip(clip, nav) || typeof nav.share !== "function") return null;
  const title = clip.kind === "video" ? "My Bride Price video" : "Story card";
  return nav.share({ files: [clipFile(clip)], title, text });
}

export function iosSaveTarget(userAgent: string, touchPoints = 0): boolean {
  return /iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1);
}

export type SavePlan = { mode: "download" | "sheet"; filename: string };

/** iOS Safari ignores an anchor download of a blob, so the player sheet is the save path. */
export function planVideoSave(userAgent: string, touchPoints = 0): SavePlan["mode"] {
  return iosSaveTarget(userAgent, touchPoints) ? "sheet" : "download";
}

/** Prefer the MP4. If this browser cannot encode one, hand back the story card. */
export async function buildResultShare(input: { edition: string; score: number; referral: string | null }): Promise<ResultShare> {
  try {
    const blob = await buildResultVideo(input);
    return { blob, filename: `bride-price-${input.edition}-${input.score}.mp4`, kind: "video" };
  } catch {
    const response = await fetch(`/api/paid/share-card.png?edition=${encodeURIComponent(input.edition)}&score=${input.score}&frame=story`);
    if (!response.ok) throw new Error("story_unavailable");
    return { blob: await response.blob(), filename: `bride-price-${input.edition}-${input.score}-story.png`, kind: "story" };
  }
}
