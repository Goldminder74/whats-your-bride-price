import type { RegionKey } from "../app/gameData.ts";
import { classicBank } from "./classic.ts";
import type { BankQuestion, PublishedFile } from "./types.ts";

const jsonModule = (loaded: Promise<unknown>) => loaded as Promise<{ default: PublishedFile }>;

const files: Record<RegionKey, () => Promise<{ default: PublishedFile }>> = {
  west: () => jsonModule(import("../data/question-bank/published/west.json", { with: { type: "json" } })),
  east: () => jsonModule(import("../data/question-bank/published/east.json", { with: { type: "json" } })),
  central: () => jsonModule(import("../data/question-bank/published/central.json", { with: { type: "json" } })),
  north: () => jsonModule(import("../data/question-bank/published/north.json", { with: { type: "json" } })),
  south: () => jsonModule(import("../data/question-bank/published/south.json", { with: { type: "json" } })),
};

async function bundledPublished(region: RegionKey): Promise<PublishedFile> {
  const loaded = await files[region]();
  return loaded.default;
}

async function readPublished(region: RegionKey): Promise<PublishedFile> {
  if (typeof window !== "undefined") {
    try {
      const response = await fetch(`/question-bank/${region}.json`);
      if (response.ok) {
        const file = await response.json() as PublishedFile;
        if (file && Array.isArray(file.questions)) return file;
      }
    } catch {
      // The asset route can be missing on an older shell. The bundled chunk still has the bank.
    }
  }
  return bundledPublished(region);
}

export async function loadPublished(region: RegionKey): Promise<BankQuestion[]> {
  const file = await readPublished(region);
  return file.questions.filter((question) => question.lifecycleStatus === "published" && question.region === region);
}

/** Published bank plus the classic 60, classic first so a shared id keeps the live wording. */
export async function loadEligible(region: RegionKey): Promise<BankQuestion[]> {
  const published = await loadPublished(region);
  const classic = classicBank(region);
  const seen = new Set(classic.map((question) => question.id));
  return [...classic, ...published.filter((question) => !seen.has(question.id))];
}
