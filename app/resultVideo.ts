import { muxResultMp4, type AvcSample } from "../paid/mp4Mux.ts";
import type { ResultVideoStory } from "../paid/resultVideo.ts";

type Story = ResultVideoStory;

function beatLines(story: Story, seconds: number): string[] {
  const beat = [...story.beats].reverse().find((item) => seconds >= item.start) ?? story.beats[0];
  return beat?.lines ?? [];
}

function drawFrame(context: CanvasRenderingContext2D, story: Story, seconds: number): void {
  const { width, height, safe } = story;
  context.fillStyle = "#1a0e09";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#bb3e22";
  context.globalAlpha = 0.28;
  context.fillRect(0, 0, width, height);
  context.globalAlpha = 1;
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
  context.fillStyle = "#f3e7cc";
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

export async function buildResultVideo(input: { edition: string; score: number; referral: string | null }): Promise<Blob> {
  const query = `edition=${encodeURIComponent(input.edition)}&score=${input.score}${input.referral ? `&ref=${encodeURIComponent(input.referral)}` : ""}`;
  const storyResponse = await fetch(`/api/paid/result-video?${query}`);
  if (!storyResponse.ok) throw new Error("video_unavailable");
  const story = await storyResponse.json() as Story;
  if (!input.referral) {
    const cached = await fetch(`/api/paid/result-video.mp4?edition=${encodeURIComponent(input.edition)}&score=${input.score}`);
    if (cached.ok) return cached.blob();
  }
  const encoded = await encodeWithWebCodecs(story) ?? await encodeWithRecorder(story);
  if (!encoded) throw new Error("video_unavailable");
  if (!input.referral) {
    void fetch(`/api/paid/result-video.mp4?edition=${encodeURIComponent(input.edition)}&score=${input.score}`, {
      method: "POST",
      headers: { "content-type": "video/mp4" },
      body: encoded,
    });
  }
  return encoded;
}
