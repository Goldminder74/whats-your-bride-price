import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const outDir = new URL("../public/result-videos/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const regions = [
  ["west", "West Africa"],
  ["east", "East Africa"],
  ["central", "Central Africa"],
  ["north", "North Africa"],
  ["south", "Southern Africa"],
];
const tiers = [
  ["Roots Rookie", "5 cowries"],
  ["Culture Climber", "15 cowries"],
  ["Motherland Scholar", "30 cowries"],
  ["Bride Price Royalty", "50 cowries"],
];

function tierFor(score) {
  return tiers[Math.min(3, Math.floor(score / 3))];
}

for (const [key, name] of regions) {
  for (let score = 0; score <= 12; score += 1) {
    const [title, cowries] = tierFor(score);
    const lines = [
      "What's Your Bride Price?",
      name,
      `${score} / 12`,
      title,
      cowries,
      "Can you beat me?",
    ].join("\n");
    const textFile = new URL(`../public/result-videos/.${key}-${score}.txt`, import.meta.url);
    writeFileSync(textFile, lines);
    const target = new URL(`../public/result-videos/${key}-${score}.mp4`, import.meta.url);
    const result = spawnSync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "color=c=0x211744:s=720x1280:d=5:r=30",
      "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
      "-vf", `drawtext=fontfile=${font}:textfile=${textFile.pathname}:fontcolor=0xfff6d8:fontsize=42:line_spacing=18:x=(w-text_w)/2:y=460`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "baseline", "-level", "3.1",
      "-movflags", "+faststart",
      "-c:a", "aac", "-b:a", "32k",
      "-shortest",
      target.pathname,
    ], { stdio: "ignore" });
    if (result.status !== 0) {
      console.error("ffmpeg failed", key, score);
      process.exit(1);
    }
    console.log(key, score);
  }
}
